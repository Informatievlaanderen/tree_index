import express = require("express");
import asyncHandler = require("express-async-handler");
import jsonld = require("jsonld");
import { DOMAIN, EVENT_STORAGE, FRAGMENT_STORAGE, FRAGMENTATION_STORAGE, STREAM_STORAGE } from "../config";
import EntityStatus from "../entities/EntityStatus";
import RDFEvent from "../entities/Event";
import EventStream from "../entities/EventStream";
import Fragment from "../entities/Fragment";
import createStrategy from "../util/createStrategy";

const router = express.Router();

// GET /data/:streamName/:fragmentName/:fragment
router.get("/:streamName/:fragmentName/:fragment", asyncHandler(async (req, res) => {
    const streamName = req.params.streamName;
    const fragmentName: string = req.params.fragmentName;
    const fragment = req.params.fragment.toLowerCase();
    const since = req.query.since;
    const limit = 1000;

    const stream = await STREAM_STORAGE.getByName(streamName);
    if (!stream) {
        throw new Error("Stream name is invalid");
    }

    const canonicalStream = await STREAM_STORAGE.getByID(stream.sourceURI);
    if (streamName !== canonicalStream?.name) {
        let canonicalUrl: string;
        if (since) {
            canonicalUrl = `/data/${canonicalStream?.name}/${fragmentName}/${fragment}?since=${since}`;
        } else {
            canonicalUrl = `/data/${canonicalStream?.name}/${fragmentName}/${fragment}`;
        }
        res.redirect(301, canonicalUrl);
        return;
    }

    const g = EVENT_STORAGE.getAllByFragment(
        stream.sourceURI,
        fragmentName,
        fragment,
        since,
    );

    let firstTime: Date | undefined;
    let lastTime: Date | undefined;
    const events: RDFEvent[] = [];

    for await (const event of g) {
        if (!firstTime) {
            firstTime = event.timestamp;
        }

        lastTime = event.timestamp;

        events.push(event);
        if (events.length > limit && firstTime?.toISOString() !== lastTime.toISOString()) {
            break;
        }
    }

    const quads = events.flatMap((e) => e.data);
    const doc = await jsonld.fromRDF(quads);
    res.json(doc);
}));

// GET /data/:streamName/:fragmentationName
router.get("/:streamName/:fragmentationName", asyncHandler(async (req, res) => {
    const streamName = req.params.streamName;
    const fragmentationName: string = req.params.fragmentationName;
    const limit = 1000;

    const stream = await STREAM_STORAGE.getByName(streamName);
    if (!stream) {
        throw new Error("Stream name is invalid");
    }

    const canonicalStream = await STREAM_STORAGE.getByID(stream.sourceURI);
    const collectionURL = createCollectionURL(DOMAIN, streamName);
    const canonicalURL = createFragmentationURL(DOMAIN, streamName, fragmentationName);
    if (streamName !== canonicalStream?.name) {
        res.redirect(301, canonicalURL);
        return;
    }

    const fragmentation = await FRAGMENTATION_STORAGE.getByName(stream.sourceURI, fragmentationName);
    if (!fragmentation || fragmentation.status === EntityStatus.DISABLED) {
        throw new Error("Fragmentation name is invalid");
    }

    const g = FRAGMENT_STORAGE.getAllByFragmentation(
        stream.sourceURI,
        fragmentationName,
    );

    const strategy = createStrategy(fragmentation);
    const fragments: Fragment[] = await strategy.filterIndexFragments(g);

    const payload: any[] = [];
    payload.push({
        "@id": collectionURL,
        "https://w3id.org/tree#view": canonicalURL,
    });

    const relations: any[] = [];
    for (const frag of fragments) {
        relations.push({
            "@type": strategy.getRelationType(),
            "https://w3id.org/tree#node": {
                "@id": createFragmentURL(DOMAIN, streamName, fragmentationName, frag.value),
                "https://w3id.org/tree#remainingItems": frag.count,
            },
            "https://w3id.org/tree#path": fragmentation.shaclPath.map((p) => {
                return { "@id": p };
            }),
            "https://w3id.org/tree#value": {
                "@value": frag.value,
                "@type": frag.dataType,
            },
        });
    }

    const blob = {
        "@id": canonicalURL,
        "https://w3id.org/tree#relation": relations,
        "@included": payload,
    };

    res.json(blob);
}));

// GET /data/:streamName
router.get("/:streamName", asyncHandler(async (req, res) => {
    const streamName = req.params.streamName;
    const since = req.query.since;
    const limit = 250;

    const stream = await STREAM_STORAGE.getByName(streamName);
    if (!stream) {
        throw new Error("Stream name is invalid");
    }

    const canonicalStream = await STREAM_STORAGE.getByID(stream.sourceURI);
    const collectionURL = createCollectionURL(DOMAIN, stream.name);
    const canonicalURL = createCollectionURL(DOMAIN, stream.name);
    if (since) {
        canonicalURL.searchParams.append("since", since);
    }

    if (streamName !== canonicalStream?.name) {
        // requested this resource under a different name
        res.redirect(301, canonicalURL);
        return;
    }

    const g = EVENT_STORAGE.getAllByStream(
        stream.sourceURI,
        since,
    );

    let firstTime: Date | undefined;
    let lastTime: Date | undefined;
    const events: RDFEvent[] = [];

    let exhausted = true;
    for await (const event of g) {
        if (!firstTime) {
            firstTime = event.timestamp;
        }

        lastTime = event.timestamp;

        events.push(event);
        if (events.length >= limit && firstTime?.toISOString() !== lastTime.toISOString()) {
            // we stopped because the page is full
            // not because we ran out of data
            exhausted = false;
            break;
        }
    }

    const quads = events.flatMap((e) => e.data);
    const payload: any[] = await jsonld.fromRDF(quads);
    payload.unshift({
        "@id": collectionURL,
        "https://w3id.org/tree#view": canonicalURL,
        "https://w3id.org/tree#member": payload.map((e) => {
            return { "@id": e["@id"] };
        }),
    });

    const relations: any[] = [];
    const blob = {
        "@id": canonicalURL,
        "https://w3id.org/tree#relation": relations,
        "@included": payload,
    };

    if (!exhausted && lastTime) {
        relations.push(buildNextRelation(stream, lastTime));
    }

    res.json(blob);
}));

function buildNextRelation(stream: EventStream, time: Date) {
    const nextURL = createCollectionURL(DOMAIN, stream.name);
    nextURL.searchParams.append("since", time.toISOString());
    return {
        "@type": "https://w3id.org/tree#GreaterOrEqualThanRelation",
        "https://w3id.org/tree#node": {
            "@id": nextURL,
        },
        "https://w3id.org/tree#path": stream.timeProperty.map((p) => {
            return { "@id": p };
        }),
        "https://w3id.org/tree#value": {
            "@value": time.toISOString(),
            "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
        },
    };
}

function createCollectionURL(base: string, streamName: string): URL {
    return new URL(`/data/${streamName}`, base);
}

function createFragmentationURL(
    base: string,
    streamName: string,
    fragmentationName: string,
): URL {
    return new URL(`/data/${streamName}/${fragmentationName}`, base);
}

function createFragmentURL(
    base: string,
    streamName: string,
    fragmentationName: string,
    bucketValue: string,
): URL {
    return new URL(`/data/${streamName}/${fragmentationName}/${bucketValue}`, base);
}

export default router;
