import './style.css';
import 'ol-layerswitcher/dist/ol-layerswitcher.css';
import 'ol-popup/src/ol-popup.css';

import {
  Collection, Feature, Map, View,
} from 'ol';
import LayerGroup from 'ol/layer/Group';
import ImageLayer from 'ol/layer/Image';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import RasterSource from 'ol/source/Raster';
import XYZ from 'ol/source/XYZ';
import TileGrid from 'ol/tilegrid/TileGrid';
import {bbox as bboxStrategy} from 'ol/loadingstrategy';
import proj4 from 'proj4';
import {register} from 'ol/proj/proj4';
import {Projection, fromLonLat, transformExtent} from 'ol/proj';
import {containsExtent as contains, extend, intersects} from 'ol/extent';
import {EsriJSON, GeoJSON} from 'ol/format';
import {
  Circle as CircleStyle,
  Fill,
  Stroke,
  Style,
  Text,
} from 'ol/style';
import Polygon, {circular} from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import {
  Attribution,
  Control,
  Rotate,
  ScaleLine,
  Zoom,
} from 'ol/control';
import Link from 'ol/interaction/Link';
import LayerSwitcher from 'ol-layerswitcher';
import Popup from 'ol-popup';

import NI_AONB from './data/NI_AONB.json?url';
import NI_ASSI from './data/NI_ASSI.json?url';
import NI_NNR from './data/NI_NNR.json?url';
import NI_SAC from './data/NI_SAC.json?url';
import NI_SPA from './data/NI_SPA.json?url';
import BOTA from './data/BOTA.json?url';
import HEMA from './data/HEMA.json?url';
import TRIGPOINTS from './data/trigpoints.json?url';

// Setup the EPSG:27700 (British National Grid) projection.
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');
proj4.defs('EPSG:29902', '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +a=6377340.189 +rf=299.3249646 +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs +type=crs');
proj4.defs('EPSG:32630', '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs +type=crs');
register(proj4);
const projection27700 = new Projection({
  code: 'EPSG:27700',
  extent: [-90607.34, -152247.02, 682220.39, 1247821.27],
});

const osGridPrefixes = [
  ['SV', 'SW', 'SX', 'SY', 'SZ', 'TV', 'TW'],
  ['SQ', 'SR', 'SS', 'ST', 'SU', 'TQ', 'TR'],
  ['SL', 'SM', 'SN', 'SO', 'SP', 'TL', 'TM'],
  ['SF', 'SG', 'SH', 'SJ', 'SK', 'TF', 'TG'],
  ['SA', 'SB', 'SC', 'SD', 'SE', 'TA', 'TB'],
  ['NV', 'NW', 'NX', 'NY', 'NZ', 'OV', 'OW'],
  ['NQ', 'NR', 'NS', 'NT', 'NU', 'OQ', 'OR'],
  ['NL', 'NM', 'NN', 'NO', 'NP', 'OL', 'OM'],
  ['NF', 'NG', 'NH', 'NJ', 'NK', 'OF', 'OG'],
  ['NA', 'NB', 'NC', 'ND', 'NE', 'OA', 'OB'],
  ['HV', 'HW', 'HX', 'HY', 'HZ', 'JV', 'JW'],
  ['HQ', 'HR', 'HS', 'HT', 'HU', 'JQ', 'JR'],
  ['HL', 'HM', 'HN', 'HO', 'HP', 'JL', 'JM'],
];

function getMaidenheadGridFeatures27700(extent, level) {
  const features = [];
  const newExtent = transformExtent(extent, projection27700, 'EPSG:4326');
  let step = 10;
  for (let n = 1; n < level; n += 1) {
    step /= (n % 2) ? 10 : 24;
  }
  const x0 = Math.floor(newExtent[0] / (2 * step)) * (2 * step);
  const y0 = Math.floor(newExtent[1] / step) * step;
  const xN = Math.ceil(newExtent[2] / (2 * step)) * (2 * step);
  const yN = Math.ceil(newExtent[3] / step) * step;
  for (let x = x0; x < xN; x += 2 * step) {
    for (let y = y0; y < yN; y += step) {
      let xg = (x + 180) / 20;
      let yg = (y + 90) / 10;
      let grid = String.fromCharCode(65 + Math.floor(xg));
      grid += String.fromCharCode(65 + Math.floor(yg));
      for (let n = 1; n < level; n += 1) {
        if (n % 2) {
          xg = (xg - Math.floor(xg) + 1e-6) * 10;
          yg = (yg - Math.floor(yg) + 1e-6) * 10;
          grid += Math.floor(xg).toString();
          grid += Math.floor(yg).toString();
        }
        if (!(n % 2)) {
          xg = (xg - Math.floor(xg) + 1e-6) * 24;
          yg = (yg - Math.floor(yg) + 1e-6) * 24;
          grid += String.fromCharCode(65 + Math.floor(xg));
          grid += String.fromCharCode(65 + Math.floor(yg));
        }
      }
      const feature = new Feature({
        geometry: new Polygon(
          [[[x, y],
            [x + (2 * step), y],
            [x + (2 * step), y + step],
            [x, y + step],
            [x, y]]],
        ).transform('EPSG:4326', projection27700),
      });
      feature.setId(grid);
      features.push(feature);
    }
  }
  return features;
}

const extentEngland = transformExtent([-6.302170, 49.923321, 1.867676, 55.801281], 'EPSG:4326', projection27700);
const extentScotland = transformExtent([-7.888184, 54.600710, -0.571289, 60.951777], 'EPSG:4326', projection27700);
const extentWales = transformExtent([-5.416260, 51.344339, -2.644958, 53.471700], 'EPSG:4326', projection27700);
const extentNorthernIreland = transformExtent([-8.206787, 53.994854, -5.405273, 55.404070], 'EPSG:4326', projection27700);
const extentJersey = transformExtent([-2.392273, 48.855967, -1.789261, 49.317255], 'EPSG:4326', projection27700);
const extentGuernsey = transformExtent([-3.065808, 49.327176, -2.081909, 49.959632], 'EPSG:4326', projection27700);
const extentIsleOfMan = transformExtent([-4.899902, 53.972864, -4.196777, 54.490138], 'EPSG:4326', projection27700);
const extentIreland = transformExtent([-11.096191, 51.594714, -5.361328, 55.472483], 'EPSG:4326', projection27700);

const GeoJSON27700 = new GeoJSON({
  dataProjection: projection27700,
  featureProjection: projection27700,
});

class GeoJSONObjectID extends GeoJSON {
  readFeatureFromObject(object, options) {
    const feature = super.readFeatureFromObject(object, options);
    if (feature.get('OBJECTID')) {
      feature.setId(feature.get('OBJECTID'));
    } else if (feature.get('fid')) {
      feature.setId(feature.get('fid'));
    } else if (feature.get('Id')) {
      feature.setId(feature.get('Id'));
    }
    return feature;
  }
}

class GeoJSONReference extends GeoJSON {
  readFeatureFromObject(object, options) {
    const feature = super.readFeatureFromObject(object, options);
    feature.setId(feature.get('reference'));
    return feature;
  }
}

const GeoJSONObjectID27700 = new GeoJSONObjectID({
  dataProjection: projection27700,
  featureProjection: projection27700,
});

class EsriJSONObjectID extends EsriJSON {
  readFeatureFromObject(object, options) {
    return super.readFeatureFromObject(object, options, 'OBJECTID');
  }
}

// Styles
function gridStyle(feature) {
  return new Style({
    stroke: new Stroke({
      color: 'rgba(100, 100, 100, 0.2)',
      width: 3,
    }),
    text: new Text({
      text: feature.getId(),
      font: '30px bold ui-rounded',
      stroke: new Stroke({color: 'rgba(100, 100, 100, 0.5)', width: 2}),
      fill: null,
    }),
  });
}

function createTextStyle(feature, resolution, text, color, offset = 15) {
  return new Text({
    text: text,
    font: 'bold ui-rounded',
    textAlign: 'center',
    fill: new Fill({color: '#000000'}),
    stroke: new Stroke({color: color, width: 1}),
    offsetY: offset,
    overflow: (resolution < 15),
  });
}

function colorOpacity(color) {
  return color.replace(/[\d.]+\)$/g, '0.2)');
}

function pointStyleFunction(feature, resolution, color, radius) {
  let text = feature.get('reference');
  if (resolution < 40) {
    text += ` ${feature.get('name')}`;
  }
  let circleRadius = 5;
  let circleColor = color;
  let textOffset = 15;
  if (radius && radius > circleRadius) {
    circleRadius = radius;
    circleColor = colorOpacity(color);
    textOffset = 1.5;
  }
  return new Style({
    image: new CircleStyle({
      radius: circleRadius,
      fill: new Fill({color: circleColor}),
      stroke: new Stroke({color: '#000000', width: 1}),
    }),
    text: createTextStyle(feature, resolution, text, color, textOffset),
  });
}

function legendBox(color) {
  return `<div class="box" style="background-color: ${colorOpacity(color)}; border-color: ${color}"></div>`;
}

function legendDot(color) {
  return `<div class="dot" style="background-color: ${color}"></div>`;
}

function polygonStyleFunction(feature, resolution, text, color) {
  return new Style({
    stroke: new Stroke({
      color: color,
      width: 3,
    }),
    fill: new Fill({
      color: colorOpacity(color),
    }),
    text: createTextStyle(feature, resolution, text, color),
  });
}

const colorSSSI = 'rgba(0, 246, 171, 1)';
function polygonStyleFunctionSSSI(feature, resolution) {
  let text = feature.get('NAME');
  if (text === undefined) {
    text = feature.get('SSSI_NAME');
  }
  if (text === undefined) {
    text = feature.get('sssi_name');
  }
  return polygonStyleFunction(feature, resolution, text, colorSSSI);
}

const colorNNR = 'rgba(164, 180, 0, 1)';
function polygonStyleFunctionNNR(feature, resolution) {
  let text = feature.get('NAME');
  if (text === undefined) {
    text = feature.get('NNR_Name');
  }
  if (text === undefined) {
    text = feature.get('NNR_NAME');
  }
  return polygonStyleFunction(feature, resolution, text, colorNNR);
}

const colorLNR = 'rgba(110, 140, 0, 1)';
function polygonStyleFunctionLNR(feature, resolution) {
  let text = feature.get('NAME');
  if (text === undefined) {
    text = feature.get('LNR_Name');
  }
  if (text === undefined) {
    text = feature.get('LNR_NAME');
  }
  return polygonStyleFunction(feature, resolution, text, colorNNR);
}

const colorCPK = 'rgba(255, 180, 0, 1)';
function polygonStyleFunctionCPK(feature, resolution) {
  let text = feature.get('NAME');
  if (text === undefined) {
    text = feature.get('Name');
  }
  if (text === undefined) {
    text = feature.get('name');
  }
  return polygonStyleFunction(feature, resolution, text, colorCPK);
}

const colorAONB = 'rgba(247, 0, 0, 1)';
function polygonStyleFunctionAONB(feature, resolution) {
  let text = feature.get('AONB_NAME');
  if (text === undefined) {
    text = feature.get('NAME');
  }
  if (text === undefined) {
    text = feature.get('name');
  }
  return polygonStyleFunction(feature, resolution, text, colorAONB);
}

function polygonStyleFunctionNSA(feature, resolution) {
  const text = feature.get('NSAName');
  return polygonStyleFunction(feature, resolution, text, colorAONB);
}

const colorSAC = 'rgba(126, 0, 76, 1)';
function polygonStyleFunctionSAC(feature, resolution) {
  let text = feature.get('SAC_NAME');
  if (text === undefined) {
    text = feature.get('SAC_name');
  }
  if (text === undefined) {
    text = feature.get('NAME');
  }
  return polygonStyleFunction(feature, resolution, text, colorSAC);
}

const colorSPA = 'rgba(200, 100, 50, 1)';
function polygonStyleFunctionSPA(feature, resolution) {
  let text = feature.get('SPA_NAME');
  if (text === undefined) {
    text = feature.get('SPA_Name');
  }
  if (text === undefined) {
    text = feature.get('NAME');
  }
  return polygonStyleFunction(feature, resolution, text, colorSPA);
}

const colorRSPB = 'rgba(76, 0, 126, 1)';
function polygonStyleFunctionRSPB(feature, resolution) {
  const text = feature.get('Name');
  return polygonStyleFunction(feature, resolution, text, 'rgba(76, 0, 126, 1)');
}

const colorNP = 'rgba(0, 102, 0, 1)';
function polygonStyleFunctionNP(feature, resolution) {
  let text = feature.get('NPName');
  if (text === undefined) {
    text = feature.get('np_name');
  }
  if (text === undefined) {
    text = feature.get('NAME');
  }
  return polygonStyleFunction(feature, resolution, text, colorNP);
}

function createVectorLayer(stylefunc, url, extentCountry) {
  return new VectorLayer({
    minZoom: 6,
    extent: extentCountry,
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:&nbsp;Contains&nbsp;public&nbsp;sector&nbsp;information&nbsp;licensed&nbsp;under&nbsp;the&nbsp;<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>.',
      projection: projection27700,
      format: GeoJSONObjectID27700,
      strategy: (extent) => (intersects(extent, extentCountry) ? [extent] : []),
      url: (extent) => `${url}version=2.0.0&request=GetFeature&outputFormat=application/json&srsname=EPSG:27700&bbox=${extent}`,
    }),
  });
}

function createVectorLayerScotGov(stylefunc, layer) {
  return new VectorLayer({
    minZoom: 6,
    extent: extentScotland,
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:&nbsp;©&nbsp;NatureScot&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
      projection: projection27700,
      format: new EsriJSONObjectID(),
      strategy: (extent) => (intersects(extent, extentScotland) ? [extent] : []),
      url: (extent) => 'https://maps.gov.scot/server/services/ScotGov/ProtectedSites/MapServer/WFSServer?service=WFS&'
          + `typeName=${layer}&outputFormat=ESRIGEOJSON&version=2.0.0&`
          + `request=GetFeature&srsname=EPSG%3A27700&bbox=${extent}`,
    }),
  });
}

function vectorLayerEngland(stylefunc, url) {
  return new VectorLayer({
    minZoom: 6,
    extent: extentEngland,
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:&nbsp;©&nbsp;Natural&nbsp;England&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
      format: new EsriJSON(),
      projection: projection27700,
      strategy: (extent) => (
        (intersects(extent, extentEngland)
         && !contains(extentWales, extent)
         && !contains(extentScotland, extent)
         && !contains(extentNorthernIreland, extent)) ? [extent] : []),
      url: (extent) => `${url}f=json&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=`
        + `{"xmin":${extent[0]},"xmax":${extent[2]},"ymin":${extent[1]},"ymax":${extent[3]},"spatialReference":{"wkid":27700}}&`
        + 'geometryType=esriGeometryEnvelope&inSR=27700&outFields=*&outSR=27700',
    }),
  });
}

function vectorLayerScotland(stylefunc, url) {
  const layer = createVectorLayer(stylefunc, url, extentScotland);
  layer.getSource().setAttributions('Boundaries:&nbsp;©&nbsp;NatureScot&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).');
  return layer;
}
function vectorLayerWales(stylefunc, url) {
  const layer = createVectorLayer(stylefunc, url, extentWales);
  layer.getSource().setAttributions('Boundaries:&nbsp;©&nbsp;Natural&nbsp;Resources&nbsp;Wales&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).');
  return layer;
}
function vectorLayerNorthernIreland(stylefunc, url) {
  return new VectorLayer({
    minZoom: 6,
    extent: extentNorthernIreland,
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:&nbsp;©&nbsp;NIEA&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
      format: GeoJSONObjectID27700,
      projection: projection27700,
      strategy: (extent) => (
        intersects(extent, extentNorthernIreland) ? [extentNorthernIreland] : []),
      url: url,
    }),
  });
}

function createLayerGroup(
  title,
  shortTitle,
  stylefunc,
  urlEngland,
  urlScotland,
  urlWales,
  urlNorthernIreland,
  visible = true,
) {
  const layers = [];
  if (urlEngland) {
    layers.push(vectorLayerEngland(stylefunc, urlEngland));
  }
  if (urlScotland) {
    layers.push(vectorLayerScotland(stylefunc, urlScotland));
  }
  if (urlWales) {
    layers.push(vectorLayerWales(stylefunc, urlWales));
  }
  if (urlNorthernIreland) {
    layers.push(vectorLayerNorthernIreland(stylefunc, urlNorthernIreland));
  }
  return new LayerGroup({
    title: title,
    shortTitle: shortTitle,
    combine: true,
    visible: visible,
    layers: layers,
  });
}

function countryStrategy(extent) {
  const extents = [];
  [extentGuernsey, extentJersey, extentIsleOfMan, extentNorthernIreland,
    extentWales, extentScotland, extentEngland].forEach(
    (cExtent) => {
      if (intersects(extent, cExtent)) {
        if (cExtent === extentEngland) {
          extents.push(extentWales); // Due to overlap
          extents.push(extentIsleOfMan);
        }
        extents.push(cExtent);
      }
    },
  );
  return extents;
}

function gridLoader(source, prefixFunc, extent, projection, success) {
  const features = [];
  const newExtent = transformExtent(extent, projection27700, projection);
  const e0 = Math.floor(newExtent[0] / 10000);
  const n0 = Math.floor(newExtent[1] / 10000);
  const eN = Math.ceil(newExtent[2] / 10000);
  const nN = Math.ceil(newExtent[3] / 10000);
  for (let e = e0; e < eN + 1; e += 1) {
    for (let n = n0; n < nN + 1; n += 1) {
      const prefix = prefixFunc(e, n);
      if (prefix) {
        const grid = `${prefix}${Math.floor(e % 10)}${Math.floor(n % 10)}`;
        const feature = new Feature({
          geometry: new Polygon(
            [[[e * 10000, n * 10000],
              [e * 10000 + 10000, n * 10000],
              [e * 10000 + 10000, n * 10000 + 10000],
              [e * 10000, n * 10000 + 10000],
              [e * 10000, n * 10000]]],
          ).transform(projection, projection27700),
        });
        feature.setId(grid);
        features.push(feature);
      }
    }
  }
  source.addFeatures(features);
  success(features);
}

const OSMSource = new OSM({
  attributions: 'Map:&nbsp;©<a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>&nbsp;contributors.',
});

const map = new Map({
  target: 'map',
  controls: [new Zoom(), new Rotate(), new ScaleLine()],
  view: new View({
    projection: projection27700,
    center: fromLonLat([-4, 54], projection27700),
    zoom: 2,
    maxZoom: 15,
  }),
  layers: [
    new LayerGroup({
      title: 'Base maps',
      layers: [
        new TileLayer({
          title: 'Ordnance Survey',
          shortTitle: 'OS',
          type: 'base',
          visible: false,
          extent: projection27700.getExtent(),
          source: new XYZ({
            attributions: 'Map:&nbsp;OS&nbsp;©Crown&nbsp;copyright&nbsp;and&nbsp;database&nbsp;right&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
            projection: projection27700,
            tileGrid: new TileGrid({
              origin: [-238375.0, 1376256.0],
              resolutions: [896.0, 448.0, 224.0, 112.0, 56.0, 28.0, 14.0, 7.0, 3.5, 1.75],
            }),
            url: `https://api.os.uk/maps/raster/v1/zxy/Light_27700/{z}/{x}/{y}.png?key=${import.meta.env.VITE_OS_APIKEY}`,
          }),
        }),
        new ImageLayer({
          title: 'OSM (Greyscale)',
          shortTitle: 'OSMG',
          type: 'base',
          source: new RasterSource({
            sources: [OSMSource],
            operation: (pixels) => {
              const pixel = pixels[0];

              const r = pixel[0];
              const g = pixel[1];
              const b = pixel[2];

              const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;

              pixel[0] = v; // Red
              pixel[1] = v; // Green
              pixel[2] = v; // Blue

              return pixel;
            },
          }),
        }),
        new TileLayer({
          title: 'OSM',
          shortTitle: 'OSM',
          type: 'base',
          visible: false,
          source: OSMSource,
        }),
        new TileLayer({
          title: 'OpenTopoMap',
          shortTitle: 'OTM',
          type: 'base',
          visible: false,
          source: new XYZ({
            attributions: 'Map&nbsp;data:&nbsp;©<a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>&nbsp;contributors,&nbsp;SRTM. '
              + 'Map&nbsp;display:&nbsp;©<a href="http://opentopomap.org" target="_blank">OpenTopoMap</a>&nbsp;(<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank">CC-BY-SA</a>).',
            url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
          }),
        }),
      ],
    }),
    new LayerGroup({
      title: 'Overlays',
      layers: [
        new VectorLayer({
          title: 'CI MGRS Grid (CI WAB Squares)',
          shortTitle: 'CIG',
          visible: false,
          minZoom: 6,
          extent: extend(extentJersey, extentGuernsey),
          style: gridStyle,
          source: new VectorSource({
            overlaps: false,
            strategy: bboxStrategy,
            loader: function loader(extent, resolution, projection, success) {
              return gridLoader(
                this,
                (e, n) => {
                  const eAlphabet = 'STUVWXYZ';
                  const nAlphabet = 'ABCDEFGHJKLMNPQRSTUV';
                  const ePrefix = eAlphabet[Math.floor(e / 10) - 1];
                  const nPrefix = nAlphabet[(Math.floor(n / 10) + 5) % 20]; // even zone 'F' start
                  return ePrefix + nPrefix;
                },
                extent,
                'EPSG:32630',
                success,
              );
            },
          }),
        }),
        new VectorLayer({
          title: 'Irish Grid (NI WAB Squares)',
          shortTitle: 'IRG',
          visible: false,
          minZoom: 6,
          extent: extentIreland,
          style: gridStyle,
          source: new VectorSource({
            overlaps: false,
            strategy: bboxStrategy,
            loader: function loader(extent, resolution, projection, success) {
              return gridLoader(
                this,
                (e, n) => {
                  if (e < 0) { return null; }
                  const alphabet = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
                  return alphabet[Math.floor((49 - n) / 10) * 5 + Math.floor(e / 10)];
                },
                extent,
                'EPSG:29902',
                success,
              );
            },
          }),
        }),
        new VectorLayer({
          title: 'OS Grid (GB WAB Squares)',
          shortTitle: 'OSG',
          visible: false,
          minZoom: 6,
          extent: extend(extentEngland, extentScotland),
          style: gridStyle,
          source: new VectorSource({
            overlaps: false,
            strategy: bboxStrategy,
            loader: function loader(extent, resolution, projection, success) {
              return gridLoader(
                this,
                (e, n) => {
                  try {
                    return osGridPrefixes[Math.floor(n / 10)][Math.floor(e / 10)];
                  } catch (error) {
                    return null;
                  }
                },
                extent,
                projection,
                success,
              );
            },
          }),
        }),
        new VectorLayer({
          title: 'Maidenhead Grid',
          shortTitle: 'MHG',
          visible: false,
          minZoom: 6,
          style: (feature) => new Style({
            stroke: new Stroke({
              color: 'rgba(255, 100, 100, 0.2)',
              width: 3,
            }),
            text: new Text({
              text: feature.getId(),
              font: '25px bold ui-rounded',
              stroke: new Stroke({color: 'rgba(255, 100, 100, 0.5)', width: 2}),
              fill: null,
            }),
          }),
          source: new VectorSource({
            projection: projection27700,
            overlaps: false,
            strategy: bboxStrategy,
            loader: function loader(extent, resolution, projection, success) {
              const features = getMaidenheadGridFeatures27700(extent, 3);
              this.addFeatures(features);
              success(features);
            },
          }),
        }),
        new VectorLayer({
          title: `${legendDot('rgba(221, 221, 221, 0.5)')} Trigpoints (pillar)`,
          shortTitle: 'TRIG',
          refUrl: 'https://trigpointing.uk/trig/',
          visible: false,
          minZoom: 6,
          style: (feature, resolution) => pointStyleFunction(feature, resolution, 'rgba(221, 221, 221, 1)', 30 / resolution),
          source: new VectorSource({
            attributions: 'Trigpoints:&nbsp;<a href="https://trigpointing.uk/" target="_blank">TrigpointingUK</a>.',
            projection: projection27700,
            format: GeoJSON27700,
            url: TRIGPOINTS,
          }),
        }),
      ],
    }),
    new LayerGroup({
      title: 'Designations',
      layers: [
        createLayerGroup( // Previously Areas of Outstanding Natural Beauty
          `${legendBox(colorAONB)} National Landscapes / AONB`,
          'AONB',
          polygonStyleFunctionAONB,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Areas_of_Outstanding_Natural_Beauty_England/FeatureServer/0/query?',
          null, // National Scenic Areas below
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_AONB&',
          NI_AONB,
          false,
        ),
        new LayerGroup({
          title: `${legendBox(colorAONB)} National Scenic Areas`,
          shortTitle: 'NSA',
          combine: true,
          visible: false,
          layers: [
            createVectorLayerScotGov(polygonStyleFunctionNSA, 'PS:NationalScenicAreas'),
          ],
        }),
        new LayerGroup({
          title: `${legendBox(colorNP)} National Parks`,
          shortTitle: 'NP',
          combine: true,
          visible: false,
          layers: [
            vectorLayerEngland(
              polygonStyleFunctionNP,
              'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Parks_England/FeatureServer/0/query?',
            ),
            vectorLayerWales(
              polygonStyleFunctionNP,
              'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_NATIONAL_PARK&',
            ),
            createVectorLayerScotGov(polygonStyleFunctionNP, 'PS:CairngormsNationalPark'),
            createVectorLayerScotGov(polygonStyleFunctionNP, 'PS:LochLomondTrossachsNationalPark'),
          ],
        }),
        createLayerGroup(
          `${legendBox(colorSSSI)} Special Sites of Scientific Interest`,
          'SSSI',
          polygonStyleFunctionSSSI,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/SSSI_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:sssi&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_SSSI&',
          NI_ASSI,
          false,
        ),
        createLayerGroup(
          `${legendBox(colorSAC)} Special Areas of Conservation`,
          'SAC',
          polygonStyleFunctionSAC,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Special_Areas_of_Conservation_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:sac&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_SAC&',
          NI_SAC,
          false,
        ),
        createLayerGroup(
          `${legendBox(colorSPA)} Special Protection Areas`,
          'SPA',
          polygonStyleFunctionSPA,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Special_Protection_Areas_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:spa&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_SPA&',
          NI_SPA,
          false,
        ),
        createLayerGroup(
          `${legendBox(colorCPK)} Country Parks`,
          'CPK',
          polygonStyleFunctionCPK,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Country_Parks_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:cpk&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=geonode:country_parks&',
          null,
        ),
        createLayerGroup(
          `${legendBox(colorLNR)} Local Nature Reserves`,
          'LNR',
          polygonStyleFunctionLNR,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Local_Nature_Reserves_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:lnr&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_LNR&',
          null,
          false,
        ),
        createLayerGroup(
          `${legendBox(colorNNR)} National Nature Reserves`,
          'NNR',
          polygonStyleFunctionNNR,
          'https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/National_Nature_Reserves_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:nnr&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_NNR&',
          NI_NNR,
        ),
        new LayerGroup({
          title: `${legendBox(colorRSPB)} RSPB Reserves`,
          shortTitle: 'RSPB',
          combine: true,
          layers: [
            new VectorLayer({
              minZoom: 6,
              style: polygonStyleFunctionRSPB,
              source: new VectorSource({
                attributions: 'Boundaries:&nbsp;RSPB&nbsp;Geographic&nbsp;Data&nbsp;End&nbsp;User&nbsp;Agreement.',
                format: new EsriJSON(),
                projection: projection27700,
                strategy: bboxStrategy,
                url: (extent) => 'https://services1.arcgis.com/h1C9f6qsGKmqXsVs/ArcGIS/rest/services/RSPB_Public_Reserves/FeatureServer/0/query/?'
                  + 'f=json&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry='
                  + `{"xmin":${extent[0]},"xmax":${extent[2]},"ymin":${extent[1]},"ymax":${extent[3]},"spatialReference":{"wkid":27700}}&`
                  + 'geometryType=esriGeometryEnvelope&inSR=27700&outFields=OBJECTID,Name&outSR=27700&where=Access%3D\'Publicised Reserve\'',
              }),
            }),
          ],
        }),
      ],
    }),
    new LayerGroup({
      title: 'Programmes',
      layers: [
        new VectorLayer({
          title: `${legendDot('rgba(122, 174, 0, 0.5)')} Bunkers on the Air`,
          shortTitle: 'BOTA',
          minZoom: 6,
          visible: false,
          style: (feature, resolution) => pointStyleFunction(feature, resolution, 'rgba(122, 174, 0, 1)', 1000 / resolution),
          source: new VectorSource({
            attributions: 'BOTA&nbsp;references:<a href="https://bunkersontheair.org/" target="_blank">©&nbsp;Bunkers&nbsp;on&nbsp;the&nbsp;Air</a>',
            format: GeoJSON27700,
            url: BOTA,
          }),
        }),
        new VectorLayer({
          title: `${legendDot('rgba(218, 70, 255, 1)')} HuMPs Excl. Marilyns Award`,
          shortTitle: 'HEMA',
          refUrl: 'http://hema.org.uk/fullSummit.jsp?summitKey=',
          minZoom: 6,
          visible: false,
          style: (feature, resolution) => pointStyleFunction(feature, resolution, 'rgba(218, 70, 255, 1)'),
          source: new VectorSource({
            attributions: 'HEMA&nbsp;references:<a href="http://hema.org.uk/" target="_blank">©&nbsp;HEMA</a>',
            format: GeoJSON27700,
            url: HEMA,
          }),
        }),
        new VectorLayer({
          title: `${legendDot('rgba(122, 174, 255, 1)')} Summits on the Air`,
          shortTitle: 'SOTA',
          refUrl: 'https://www.sotadata.org.uk/en/summit/',
          minZoom: 6,
          visible: false,
          style: (feature, resolution) => pointStyleFunction(feature, resolution, 'rgba(122, 174, 255, 1)'),
          source: new VectorSource({
            attributions: 'SOTA&nbsp;references:<a href="https://www.sota.org.uk/" target="_blank">©&nbsp;Summits&nbsp;on&nbsp;the&nbsp;Air</a>',
            format: GeoJSON27700,
            strategy: countryStrategy,
            loader: function loader(extent, resolution, projection, success, failure) {
              const vectorSource = this;
              let code = '';
              if (extent === extentGuernsey) {
                code = 'GU';
              } else if (extent === extentJersey) {
                code = 'GJ';
              } else if (extent === extentIsleOfMan) {
                code = 'GD';
              } else if (extent === extentNorthernIreland) {
                code = 'GI';
              } else if (extent === extentWales) {
                code = 'GW';
              } else if (extent === extentScotland) {
                code = 'GM';
              } else if (extent === extentEngland) {
                code = 'G';
              } else {
                failure(); // shouldn't ever get here
                return;
              }
              const url = `https://api2.sota.org.uk/api/associations/${code}`;
              const xhr = new XMLHttpRequest();
              xhr.open('GET', url);
              xhr.responseType = 'json';
              function onError() {
                vectorSource.removeLoadedExtent(extent);
                failure();
              }
              xhr.onerror = onError;
              xhr.onload = () => {
                if (xhr.status === 200) {
                  xhr.response.regions.forEach((region) => {
                    const features = [];
                    const rUrl = `https://api2.sota.org.uk/api/regions/${region.associationCode}/${region.regionCode}`;
                    const rXhr = new XMLHttpRequest();
                    rXhr.open('GET', rUrl);
                    rXhr.responseType = 'json';
                    rXhr.onerror = onError;
                    rXhr.onload = () => {
                      if (xhr.status === 200) {
                        rXhr.response.summits.forEach((summit) => {
                          const feature = new Feature({
                            geometry: new Point(
                              fromLonLat(
                                [summit.longitude, summit.latitude],
                                projection27700,
                              ),
                            ),
                            reference: summit.summitCode,
                            name: summit.name,
                          });
                          feature.setId(summit.summitCode);
                          features.push(feature);
                        });
                        vectorSource.addFeatures(features);
                      }
                    };
                    rXhr.send();
                  });
                } else {
                  onError();
                }
              };
              xhr.send();
            },
          }),
        }),
        new VectorLayer({
          title: `${legendDot('#00FF00')} World Wide Flora & Fauna`,
          shortTitle: 'WWFF',
          refUrl: 'https://wwff.co/directory/?showRef=',
          minZoom: 6,
          style: (feature, resolution) => pointStyleFunction(feature, resolution, '#00FF00'),
          visible: false,
          source: new VectorSource({
            attributions: 'WWFF&nbsp;references:&nbsp;<a href="https://wwff.co/" target="_blank">WWFF</a>;&nbsp;<a href="https://wwff.co/" target="_blank">GxFF</a>;&nbsp;<a href="https://www.cqgma.org/" target="_blank">GMA</a>.',
            strategy: countryStrategy,
            loader: function loader(extent, resolution, projection, success, failure) {
              const vectorSource = this;
              let wwffCode = '';
              if (extent === extentGuernsey) {
                wwffCode = 'GU';
              } else if (extent === extentJersey) {
                wwffCode = 'GJ';
              } else if (extent === extentIsleOfMan) {
                wwffCode = 'GD';
              } else if (extent === extentNorthernIreland) {
                wwffCode = 'GI';
              } else if (extent === extentWales) {
                wwffCode = 'GW';
              } else if (extent === extentScotland) {
                wwffCode = 'GM';
              } else if (extent === extentEngland) {
                wwffCode = 'G';
              } else {
                failure(); // shouldn't ever get here
                return;
              }
              const url = `https://www.cqgma.org/mvs/aaawff.php?r=${wwffCode}`;
              const xhr = new XMLHttpRequest();
              xhr.open('GET', url);
              function onError() {
                vectorSource.removeLoadedExtent(extent);
                failure();
              }
              xhr.onerror = onError;
              xhr.onload = () => {
                const features = [];
                if (xhr.status === 200) {
                  xhr.responseText.split('|').forEach((item) => {
                    const subitems = item.split('*');
                    if (subitems[2] && subitems[1]) {
                      const feature = new Feature({
                        geometry: new Point(
                          fromLonLat(
                            [subitems[2], subitems[1]],
                            projection27700,
                          ),
                        ),
                        reference: subitems[0],
                        name: subitems[3],
                      });
                      feature.setId(subitems[0]);
                      features.push(feature);
                    }
                  });
                  vectorSource.addFeatures(features);
                  success(features);
                } else {
                  onError();
                }
              };
              xhr.send();
            },
          }),
        }),
        new VectorLayer({
          title: `${legendDot('#FFFF00')} Parks on the Air`,
          shortTitle: 'POTA',
          refUrl: 'https://pota.app/#/park/',
          minZoom: 6,
          style: (feature, resolution) => pointStyleFunction(feature, resolution, '#FFFF00'),
          source: new VectorSource({
            attributions: 'POTA&nbsp;references:&nbsp;<a href="https://parksontheair.com/" target="_blank">Parks&nbsp;on&nbsp;the&nbsp;Air®.</a>',
            projection: projection27700,
            format: new GeoJSONReference({featureProjection: projection27700}),
            strategy: bboxStrategy,
            url: (extent) => {
              let newExtent = transformExtent(extent, projection27700, 'EPSG:4326');
              newExtent = [
                Math.floor(newExtent[0] * 10) / 10,
                Math.floor(newExtent[1] * 10) / 10,
                Math.ceil(newExtent[2] * 10) / 10,
                Math.ceil(newExtent[3] * 10) / 10];
              return `https://api.pota.app/park/grids/${newExtent[1]}/${newExtent[0]}/${newExtent[3]}/${newExtent[2]}/0`;
            },
          }),
        }),
      ],
    }),
  ],
});

const link = new Link({params: ['x', 'y', 'z'], replace: true});
function layersLinkCallback(newValue) {
  if (newValue) { // only update if no null
    const layers = newValue.split(' ');
    LayerSwitcher.forEachRecursive(map, (layer) => {
      const shortTitle = layer.get('shortTitle');
      if (layers.includes(shortTitle)) {
        layer.setVisible(true);
      } else if (shortTitle) {
        layer.setVisible(false);
      }
    });
  }
}
layersLinkCallback(link.track('layers', layersLinkCallback));

const activeLayers = new Collection();
LayerSwitcher.forEachRecursive(map, (layer) => {
  const shortTitle = layer.get('shortTitle');
  if (shortTitle) {
    if (layer.getVisible()) {
      activeLayers.push(shortTitle);
    }
    layer.on('change:visible', () => {
      if (layer.getVisible()) {
        activeLayers.push(shortTitle);
      } else {
        activeLayers.remove(shortTitle);
      }
    });
  }
});
activeLayers.on('change:length', () => {
  link.update('layers', activeLayers.getArray().join(' '));
});
map.addInteraction(link);

// Close attribution on map move; open when layers change.
const attribution = new Attribution({collapsible: true, collapsed: false});
map.addControl(attribution);
map.once('movestart', () => { // initial centre map call
  map.on('movestart', () => { attribution.setCollapsed(true); });
});
LayerSwitcher.forEachRecursive(map, (layer) => {
  layer.on('change:visible', () => {
    if (layer.getVisible()) { attribution.setCollapsed(false); }
  });
});

const popup = new Popup();
map.addOverlay(popup);
map.on('singleclick', (event) => {
  let content = '';
  map.forEachFeatureAtPixel(
    event.pixel,
    (feature, layer) => {
      let url = layer.get('refUrl');
      if (feature.get('refUrl')) {
        url += feature.get('refUrl');
      } else {
        url += feature.get('reference');
      }
      content += `<a href="${url}" target="_blank">${feature.get('reference')} ${feature.get('name')}</a><br>`;
    },
    {
      layerFilter: (layer) => layer.get('refUrl'),
      hitTolerance: 2,
    },
  );
  if (content) { popup.show(event.coordinate, content); }
});

const zoomInLayer = new VectorLayer({
  maxZoom: 6,
  style: new Style({
    text: new Text({
      text: 'Zoom In',
      font: '30px bold ui-rounded',
      fill: new Fill({color: '#000000'}),
      stroke: new Stroke({color: '#000000', width: 1}),
    }),
  }),
  source: new VectorSource({
    attributions: '<a href="https://github.com/kwirk/pota-gb-map" target="_blank">Developed&nbsp;by&nbsp;Steven&nbsp;Hiscocks&nbsp;M1SDH.</a>',
    projection: projection27700,
    format: GeoJSON27700,
    strategy: bboxStrategy,
    loader: function loader(extent, resolution, projection, success) {
      this.clear();
      this.addFeature(
        new Feature({
          geometry: new Point([
            (extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2,
          ]),
        }),
      );
      success();
    },
  }),
});
map.addLayer(zoomInLayer);
map.on('movestart', () => {
  zoomInLayer.getSource().refresh();
});

const source = new VectorSource();
const layer = new VectorLayer({
  source: source,
  style: new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({color: '#AAAAFF'}),
      stroke: new Stroke({color: '#0000FF', width: 1}),
    }),
  }),
});
map.addLayer(layer);

navigator.geolocation.watchPosition(
  (pos) => {
    const coords = [pos.coords.longitude, pos.coords.latitude];
    const accuracy = circular(coords, pos.coords.accuracy);
    source.clear(true);
    source.addFeatures([
      new Feature(
        accuracy.transform('EPSG:4326', projection27700),
      ),
      new Feature(new Point(fromLonLat(coords, projection27700))),
    ]);
  },
  () => {},
  {
    enableHighAccuracy: true,
  },
);

const locate = document.createElement('div');
locate.className = 'ol-control ol-unselectable locate';
locate.innerHTML = '<button title="Locate me">◎</button>';
locate.addEventListener('click', () => {
  if (!source.isEmpty()) {
    map.getView().fit(source.getExtent(), {
      maxZoom: 12,
      duration: 500,
    });
  }
});

map.addControl(
  new Control({
    element: locate,
  }),
);

const layerSwitcher = new LayerSwitcher({
  reverse: true,
  groupSelectStyle: 'none',
  startActive: true,
});
map.addControl(layerSwitcher);
