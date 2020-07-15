import Bucket from "../entities/Fragment";
import FragmentKind from "../entities/FragmentKind";
import RDFObject from "../entities/RDFObject";
import { URI } from "../util/constants";
import BucketStrategy from "./BucketStrategy";

export default class PrefixBucketStrategy extends BucketStrategy {
    // protected maxLength: number | undefined;

    constructor(streamID: URI, fragmentName: string, shaclPath: URI[], maxLength?: number) {
        super(streamID, fragmentName, shaclPath);
        // this.maxLength = maxLength;
    }

    public labelObject(object: RDFObject): Bucket[] {
        const result: Bucket[] = [];
        const value = this.selectValue(object);

        if (value) {
            for (let i = 1; i <= value.length; i++) {
                const prefix = value.substr(0, i);
                result.push(this.getBucket(prefix));
            }
        }

        return result;
    }

    protected getBucket(value: string): Bucket {
        if (!this.buckets.has(value)) {
            const bucket = new Bucket(this.streamID, this.fragmentName, value);
            this.buckets.set(value, bucket);
        }

        return this.buckets.get(value) as Bucket;
    }
}
