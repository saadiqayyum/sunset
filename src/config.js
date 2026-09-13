// Shared between the offline scripts and the browser app.

// Sunset azimuth at ~7degS runs 246-294 across the year.
// 230-310 gives margin for the sun's approach while still above the horizon.
export const AZ_MIN = 230;
export const AZ_MAX = 310;
export const AZ_COUNT = AZ_MAX - AZ_MIN + 1; // 81 values per POI

// Raycast settings
export const MAX_DIST = 30_000; // metres; terrain beyond this rarely sets the horizon
export const STEP = 40;         // metres; roughly the DEM cell size
export const EYE = 1.7;         // observer height

// Copernicus GLO-30 vertical error (LE90 < 4 m). Terrain must clear the observer
// by this much to count, or 40 m-away noise reads as a 6-degree wall.
export const DEM_ERR = 4;

// Viewpoint nodes often sit beside the actual deck or summit. Stand on the
// highest cell within this radius instead. Other venues stay where mapped.
export const SNAP_RADIUS = 50;  // metres

// Earth curvature with standard atmospheric refraction (k = 0.13)
export const R_EFF = 6_371_000 / (1 - 0.13);

// Sun is considered fully set at this apparent altitude
export const HORIZON_ALT = -0.833;

// East Java
export const BBOX = { south: -9, west: 111, north: -6, east: 115 };
export const CENTER = [112.75, -7.6];
export const TZ = 'Asia/Jakarta';
