import cassandra = require("cassandra-driver");
import CassandraFragmentationStorage from "./persistence/fragmentations/CassandraFragmentationStorage";
import CassandraFragmentStorage from "./persistence/fragments/CassandraFragmentStorage";
import CassandraEventStorage from "./persistence/events/CassandraEventStorage";
import CassandraEventStreamStorage from "./persistence/streams/CassandraEventStreamStorage";
import DummyStageStorage from "./persistence/state/DummyStateStorage";
import CassandraStageStorage from "./persistence/state/CassandraStateStorage";

const cassandraClient = new cassandra.Client({
    contactPoints: ["172.17.0.2:9042"],
    localDataCenter: "datacenter1",
    pooling: {
        maxRequestsPerConnection: 32768,
    },
});

export const STREAM_STORAGE = new CassandraEventStreamStorage(cassandraClient);
export const FRAGMENTATION_STORAGE = new CassandraFragmentationStorage(cassandraClient);
export const FRAGMENT_STORAGE = new CassandraFragmentStorage(cassandraClient);
export const EVENT_STORAGE = new CassandraEventStorage(cassandraClient);
export const STATE_STORAGE = new CassandraStageStorage(cassandraClient);
