// npm run vendor  ->  ../vendor/d3-lite.js (single minified ES module, committed to the repo)
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
export default {
  input: 'vendor-entry.js',
  output: { file: '../vendor/d3-lite.js', format: 'es', banner: '/* d3-geo, d3-selection, d3-scale, d3-shape, d3-interpolate, topojson-client (ISC/BSD-3, see package licences) */' },
  plugins: [resolve(), terser()],
};
