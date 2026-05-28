import type {
	AppHandle,
	AppPlacement,
	BlockHandle,
	CRDTDocument,
	PenDocument,
	SchemaRegistry,
} from "@pen/types";
import {
	crdtMapToPlainRecord,
	getMapProp,
	isCRDTMap,
	type CRDTUnknownMap,
} from "../editor/crdtShapes";

type CreateBlockHandle = (
	blockId: string,
	doc: PenDocument,
	crdtDoc: CRDTDocument,
	registry: SchemaRegistry,
) => BlockHandle;

export class AppHandleImpl implements AppHandle {
	constructor(
		private readonly _id: string,
		private readonly _doc: PenDocument,
		private readonly _crdtDoc: CRDTDocument,
		private readonly _registry: SchemaRegistry,
		private readonly _createBlockHandle: CreateBlockHandle,
	) {}

	get id(): string {
		return this._id;
	}

	get type(): string {
		return this.appMap.get("type") as string;
	}

	get placement(): AppPlacement {
		return this.appMap.get("placement") as AppPlacement;
	}

	get config(): Readonly<Record<string, unknown>> {
		return crdtMapToPlainRecord(getMapProp(this.appMap, "config")) ?? {};
	}

	get anchorBlock(): BlockHandle | null {
		const placement = this.placement;
		if (placement && "blockId" in placement && placement.blockId) {
			return this._createBlockHandle(
				placement.blockId as string,
				this._doc,
				this._crdtDoc,
				this._registry,
			);
		}
		return null;
	}

	private get appMap(): CRDTUnknownMap {
		const map = this._doc.apps.get(this._id);
		if (!isCRDTMap(map)) throw new Error(`App not found: ${this._id}`);
		return map;
	}
}
