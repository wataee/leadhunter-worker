export type RegionCode = 'EU' | 'US' | 'KZ';
export type DetectedRegionCode = RegionCode | 'RU';

export declare const REGIONS: RegionCode[];
export declare const REGION_LABELS: Record<RegionCode, string>;
export declare const REGION_SHORT_LABELS: Record<RegionCode, string>;
export declare const KNOWN_EU_CHANNELS: Set<string>;
export declare const KNOWN_KZ_CHANNELS: Set<string>;
export declare const KNOWN_US_CHANNELS: Set<string>;
export declare function isSupportedRegion(region?: string | null): region is RegionCode;
export declare function detectVacancyRegion(text?: string, channel?: string): DetectedRegionCode;
