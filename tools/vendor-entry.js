// Entry point for the one-off vendor bundle (vendor/d3-lite.js). Only what the app imports is exported.
import 'd3-transition'; // side effect: adds selection.transition()
export { geoEqualEarth, geoPath, geoArea } from 'd3-geo';
export { select, selectAll } from 'd3-selection';
export { zoom, zoomIdentity } from 'd3-zoom';
export { scaleLinear, scaleQuantize } from 'd3-scale';
export { line, curveMonotoneX } from 'd3-shape';
export { interpolateArray } from 'd3-interpolate';
export { feature } from 'topojson-client';
