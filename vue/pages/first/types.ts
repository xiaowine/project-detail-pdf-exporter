export type CategoryDataMap = Record<string, Record<string, unknown>>;

export type SelectedByCategoryMap = Record<string, string[]>;

export type ItemOrderByCategoryMap = Record<string, string[]>;

export type CategoryOrderList = string[];

export type NetlistValue = string | number | boolean | null | undefined;

export type NetlistPropsMap = Record<string, NetlistValue>;

export type NetlistUnknownMap = Record<string, unknown>;

export interface NetlistPinInfoItem {
	name: string;
	number: string;
	net: string;
}

export interface NetlistComponentItem {
	props: NetlistPropsMap;
	pinInfoMap: Record<string, NetlistPinInfoItem>;
}

export interface NetlistTrackStrokeValueItem {
	default: number;
	min: number;
	max: number;
}

export interface NetlistTrackPhysicsItem {
	name: string;
	isDefault: boolean;
	unit: string;
	strokeValue: Record<string, NetlistTrackStrokeValueItem>;
}

export interface NetlistDesignRule {
	trackPhysics: Record<string, NetlistTrackPhysicsItem>;
	netRule: NetlistUnknownMap;
}

export interface NetlistData {
	version: string;
	components: Record<string, NetlistComponentItem>;
	designRule: NetlistDesignRule;
	netClass: NetlistUnknownMap;
	equalLengthNetGroup: NetlistUnknownMap;
	differentialPair: NetlistUnknownMap;
}
