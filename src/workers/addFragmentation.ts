import { workerData } from "worker_threads";
import { EVENT_STORAGE, FRAGMENTATION_STORAGE, LOGGER } from "../config";
import EntityStatus from "../entities/EntityStatus";
import Fragmentation from "../entities/Fragmentation";
import createStrategy from "../util/createStrategy";

const fragmentation: Fragmentation = workerData.fragmentation;
const storage = EVENT_STORAGE;

async function doStuff() {
    const bucketStrategy = createStrategy(fragmentation);
    let i = 0;
    for await (const event of storage.getAllByStream(fragmentation.streamID)) {
        for (const bucket of bucketStrategy.labelObject(event)) {
            await storage.addToBucket(bucket.streamID, bucket.fragmentName, bucket.value, event);
            i++;

            if (i % 1000 === 0) {
                LOGGER.info(`${fragmentation.streamID} - ${fragmentation.name} processed ${i} events`);
            }
        }
    }

    fragmentation.status = EntityStatus.DISABLED;
    FRAGMENTATION_STORAGE.add(fragmentation);
}

doStuff();
