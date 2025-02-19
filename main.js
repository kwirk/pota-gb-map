import './style.css';
import 'ol-layerswitcher/dist/ol-layerswitcher.css';
import 'ol-popup/dist/ol-popup.css';

import {
  Collection, Feature, Map, View,
} from 'ol';
import LayerGroup from 'ol/layer/Group';
import ImageLayer from 'ol/layer/Image';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import BingMaps from 'ol/source/BingMaps';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import RasterSource from 'ol/source/Raster';
import XYZ from 'ol/source/XYZ';
import TileGrid from 'ol/tilegrid/TileGrid';
import {bbox as bboxStrategy} from 'ol/loadingstrategy';
import proj4 from 'proj4';
import {register} from 'ol/proj/proj4';
import {Projection, fromLonLat, transformExtent} from 'ol/proj';
import {
  buffer,
  containsCoordinate,
  extend,
  getCenter,
  intersects,
} from 'ol/extent';
import {EsriJSON, GeoJSON} from 'ol/format';
import {
  Circle as CircleStyle,
  Fill,
  RegularShape,
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
import { LRUCache } from 'lru-cache';

import {cachedFeaturesLoader, cacheGridStrategy} from './cachedFeatureLoader';

import NI_AONB from './data/NI_AONB.json?url';
import NI_ASSI from './data/NI_ASSI.json?url';
import NI_NNR from './data/NI_NNR.json?url';
import NI_SAC from './data/NI_SAC.json?url';
import NI_SPA from './data/NI_SPA.json?url';
import BOTA from './data/BOTA.json?url';
import HEMA from './data/HEMA.json?url';
import TRIGPOINTS from './data/trigpoints.json?url';

const mapOptions = {
  textSize: parseFloat(localStorage.getItem('textSize')) || 1.0,
};

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

function OSGBPrefix(e, n) {
  return osGridPrefixes?.[Math.floor(n / 100000)]?.[Math.floor(e / 100000)];
}

function IrishPrefix(e, n) {
  const alphabet = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  return alphabet[20 - Math.floor(n / 100000) * 5 + Math.floor(e / 100000)];
}

function MGRSPrefix(e, n) {
  const eAlphabet = 'STUVWXYZ';
  const nAlphabet = 'ABCDEFGHJKLMNPQRSTUV';
  const ePrefix = eAlphabet[Math.floor(e / 100000) - 1];
  const nPrefix = nAlphabet[(Math.floor(n / 100000) + 5) % 20]; // zone 'F' start
  return ePrefix + nPrefix;
}

function WABSquare(e, n, prefixFunc, projection) {
  const [eT, nT] = proj4('EPSG:27700', projection, [e, n]);
  const prefix = prefixFunc(eT, nT);
  if (prefix) {
    return `${prefix}${Math.floor((eT % 100000) / 10000)}${Math.floor((nT % 100000) / 10000)}`;
  }
}

function osGridToEastingNorthing(ngr) {
  const prefix = ngr.slice(0, 2);
  const precision = (ngr.length - 2) / 2;
  let easting = parseInt(ngr.slice(2, 2 + precision).padEnd(5, '0'), 10);
  let northing = parseInt(ngr.slice(2 + precision, 2 + 2 * precision).padEnd(5, '0'), 10);
  if (osGridPrefixes.some((row, northIndex) => {
    const eastIndex = row.indexOf(prefix);
    if (eastIndex >= 0) {
      northing += 100000 * northIndex;
      easting += 100000 * eastIndex;
    }
    return eastIndex >= 0;
  })) return [easting, northing];
  return undefined;
}

function getMaidenheadGrid(lon, lat, level) {
  let xg = (lon + 180) / 20;
  let yg = (lat + 90) / 10;
  let grid = String.fromCharCode(65 + Math.floor(xg));
  grid += String.fromCharCode(65 + Math.floor(yg));
  for (let n = 1; n < level; n += 1) {
    xg %= 1;
    yg %= 1;
    if (n % 2) {
      xg *= 10;
      yg *= 10;
      grid += Math.floor(xg).toString();
      grid += Math.floor(yg).toString();
    } else {
      xg *= 24;
      yg *= 24;
      grid += String.fromCharCode(65 + Math.floor(xg));
      grid += String.fromCharCode(65 + Math.floor(yg));
    }
  }
  return grid;
}

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
      const grid = getMaidenheadGrid(x + (level * 1e-3), y + (level * 1e-3), level);
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
const extentChannelIslands = extend([...extentJersey], extentGuernsey);
const extentIsleOfMan = transformExtent([-4.899902, 53.972864, -4.196777, 54.490138], 'EPSG:4326', projection27700);
const extentIreland = transformExtent([-11.096191, 51.594714, -5.361328, 55.472483], 'EPSG:4326', projection27700);

function extentToCode(extent) {
  switch (extent) {
    case extentGuernsey:
      return 'GU';
    case extentJersey:
      return 'GJ';
    case extentIsleOfMan:
      return 'GD';
    case extentNorthernIreland:
      return 'GI';
    case extentWales:
      return 'GW';
    case extentScotland:
      return 'GM';
    case extentEngland:
      return 'G';
    default:
      return null;
  }
}

function locationToWABSquare(e, n) {
  let prefixFunc = OSGBPrefix;
  let projection = 'EPSG:27700';

  if (containsCoordinate(extentChannelIslands, [e, n])) {
    prefixFunc = MGRSPrefix;
    projection = 'EPSG:32630';
  } else if (containsCoordinate(extentIreland, [e, n])) {
    prefixFunc = IrishPrefix;
    projection = 'EPSG:29902';
  }
  return WABSquare(e, n, prefixFunc, projection);
}

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

// Convert MultiLineString into multiple LineString features
// Needed so labels work correctly
class EsriJSONMLS extends EsriJSON {
  readFeatures(source, options) {
    const features = [];
    super.readFeatures(source, options).forEach((baseFeature) => {
      if (baseFeature.getGeometry().getType() === 'MultiLineString') {
        baseFeature.getGeometry().getLineStrings().forEach((geometry, n) => {
          const feature = new Feature({
            ...baseFeature.getProperties(),
            geometry,
          });
          feature.setId(`${baseFeature.getId()}_${n}`);
          features.push(feature);
        });
      } else {
        features.push(baseFeature);
      }
    });
    return features;
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
      font: 'bold 30px ui-rounded',
      stroke: new Stroke({color: 'rgba(100, 100, 100, 0.5)', width: 2}),
      fill: null,
    }),
  });
}

function createTextStyle(feature, resolution, text, color, offset = 15) {
  return new Text({
    text: text,
    scale: mapOptions.textSize,
    font: 'bold ui-rounded',
    textAlign: 'center',
    fill: new Fill({color: '#000000'}),
    stroke: new Stroke({color: color, width: 1}),
    offsetY: offset,
    overflow: (resolution < 15),
  });
}

function colorOpacity(color, opacity = 0.2) {
  return color.replace(/[\d.]+\)$/g, `${opacity})`);
}

const circleImageStyleCache = new LRUCache({max: 32});

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

  let circleImageStyle = circleImageStyleCache.get(`${circleRadius}${circleColor}`);
  if (circleImageStyle === undefined) {
    circleImageStyle = new CircleStyle({
      radius: circleRadius,
      fill: new Fill({color: circleColor}),
      stroke: new Stroke({color: '#000000', width: 1}),
    });
    circleImageStyleCache.set(`${circleRadius}${circleColor}`, circleImageStyle);
  }

  return new Style({
    image: circleImageStyle,
    text: createTextStyle(feature, resolution, text, color, textOffset),
  });
}

const triangleImageStyleCache = new LRUCache({max: 8});

function triangleStyleFunction(feature, resolution, color) {
  let text = feature.get('reference');
  if (resolution < 40) {
    text += ` ${feature.get('name')}`;
  }

  const analogue = feature.get('name').split(' ')[1].includes('A');
  const nModes = feature.get('name').split(' ')[1].length;
  const digital = (nModes > 1 && analogue) || (nModes > 0 && !analogue);
  const key = `${analogue}${digital}${color}`;
  let triangleImageStyle = triangleImageStyleCache.get(key);
  if (triangleImageStyle === undefined) {
    let rotation = 0;
    if (digital) {
      rotation += Math.PI / 2;
      if (analogue) {
        rotation += Math.PI / 2;
      }
    }
    triangleImageStyle = new RegularShape({
      fill: new Fill({color: color}),
      stroke: new Stroke({color: '#000000', width: 1}),
      points: 3,
      radius: 7,
      rotation: rotation,
    });
    triangleImageStyleCache.set(key, triangleImageStyle);
  }

  return new Style({
    image: triangleImageStyle,
    text: createTextStyle(feature, resolution, text, color, 15),
  });
}

function legendBox(color, border = true) {
  return `<div class="box" style="background-color: ${colorOpacity(color, border ? 0.2 : 0.5)}; border-color: ${border ? color : colorOpacity(color, 0)}"></div>`;
}

function legendDot(color) {
  return `<div class="dot" style="background-color: ${color}"></div>`;
}

function legendTriangle(color, rotate = 0) {
  const transform = rotate === 0 ? '' : `transform: rotate(${rotate}deg);`;
  return `<div class="triangle" style="${transform}"><div class="inner-triangle" style="border-color: transparent transparent ${color} transparent;"></div></div>`;
}

function legendLine(color) {
  return `<div class="line" style="background-color: ${color}"></div>`;
}

function polygonStyleFunction(feature, resolution, text, color, bStroke = false, stroke = true) {
  return new Style({
    stroke: stroke ? new Stroke({
      color: bStroke ? '#000000' : color,
      width: bStroke ? 1 : 3,
    }) : undefined,
    fill: new Fill({
      color: colorOpacity(color, stroke ? 0.2 : 0.5),
    }),
    text: text ? createTextStyle(feature, resolution, text, color, 0) : undefined,
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
  return polygonStyleFunction(feature, resolution, text, colorRSPB);
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

const colorFP = 'rgba(109, 179, 63, 1)';
function polygonStyleFunctionFP(feature, resolution) {
  const text = feature.get('FOREST_PAR');
  return polygonStyleFunction(feature, resolution, text, colorFP);
}

const colorCROW = 'rgba(255, 255, 0, 1)';
function polygonStyleFunctionCROW(feature, resolution) {
  return polygonStyleFunction(feature, resolution, null, colorCROW, false, false);
}

function lineStyleFunction(feature, resolution, text, color, overflow = true) {
  const width = Math.max(61 / resolution, 4); // ±100ft
  return new Style({
    stroke: new Stroke({
      color: width > 4 ? colorOpacity(color, 0.5) : color,
      width: width,
    }),
    text: new Text({
      text: text,
      scale: mapOptions.textSize,
      font: 'bold ui-rounded',
      placement: 'line',
      repeat: 500,
      maxAngle: 0,
      fill: new Fill({color: '#000000'}),
      stroke: new Stroke({color: color, width: 1}),
      overflow: overflow,
      offsetY: 15,
    }),
  });
}

const colorNT = 'rgba(115, 0, 0, 1)';
function lineStyleFunctionNT(feature, resolution, name = '', overflowCheck = false) {
  let text = '';
  if (name !== '') {
    text = name;
  } else {
    text = feature.get('NAME');
    if (text === undefined) {
      text = feature.get('Name');
    }
  }
  let overflow = true;
  if (overflowCheck) {
    // Allow overflow on long sections to have some labels
    if (feature.getGeometry().getLength() < Math.max(200, 150 * resolution)) {
      overflow = false;
    }
  }
  return lineStyleFunction(feature, resolution, text, colorNT, overflow);
}

function createVectorLayer(stylefunc, url, cache, extentCountry) {
  return new VectorLayer({
    minZoom: 6,
    extent: extentCountry,
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:&nbsp;Contains&nbsp;public&nbsp;sector&nbsp;information&nbsp;licensed&nbsp;under&nbsp;the&nbsp;<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>.',
      projection: projection27700,
      format: GeoJSONObjectID27700,
      loader: cachedFeaturesLoader(cache),
      strategy: (extent) => (intersects(extent, extentCountry) ? cacheGridStrategy(extent) : []),
      url: (extent) => `${url}version=2.0.0&request=GetFeature&outputFormat=application/json&srsname=EPSG:27700&bbox=${extent}`,
    }),
  });
}

function createVectorLayerScotGov(stylefunc, layer, cachePrefix) {
  return new VectorLayer({
    minZoom: 6,
    extent: extentScotland,
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:&nbsp;©&nbsp;NatureScot&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
      projection: projection27700,
      format: new EsriJSONObjectID(),
      loader: cachedFeaturesLoader(`${cachePrefix}-GB-SCO`),
      strategy: (extent) => (intersects(extent, extentScotland) ? cacheGridStrategy(extent) : []),
      url: (extent) => 'https://maps.gov.scot/server/services/ScotGov/ProtectedSites/MapServer/WFSServer?service=WFS&'
          + `typeName=${layer}&outputFormat=ESRIGEOJSON&version=2.0.0&`
          + `request=GetFeature&srsname=EPSG%3A27700&bbox=${extent}`,
    }),
  });
}

function vectorLayerEngland(stylefunc, url, cachePrefix) {
  return new VectorLayer({
    minZoom: 6,
    extent: extentEngland,
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:&nbsp;©&nbsp;Natural&nbsp;England&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
      format: new EsriJSONMLS(),
      projection: projection27700,
      loader: cachedFeaturesLoader(`${cachePrefix}-GB-ENG`),
      strategy: (extent) => (intersects(extent, extentEngland) ? cacheGridStrategy(extent) : []),
      url: (extent) => `${url}f=json&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=`
        + `{"xmin":${extent[0]},"xmax":${extent[2]},"ymin":${extent[1]},"ymax":${extent[3]},"spatialReference":{"wkid":27700}}&`
        + 'geometryType=esriGeometryEnvelope&inSR=27700&outFields=*&outSR=27700',
    }),
  });
}

function vectorLayerScotland(stylefunc, url, cachePrefix) {
  const layer = createVectorLayer(stylefunc, url, `${cachePrefix}-GB-SCT`, extentScotland);
  layer.getSource().setAttributions('Boundaries:&nbsp;©&nbsp;NatureScot&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).');
  return layer;
}
function vectorLayerWales(stylefunc, url, cachePrefix) {
  const layer = createVectorLayer(stylefunc, url, `${cachePrefix}-GB-WLS`, extentWales);
  layer.getSource().setAttributions('Boundaries:&nbsp;©&nbsp;Natural&nbsp;Resources&nbsp;Wales&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).');
  return layer;
}
function vectorLayerNorthernIreland(stylefunc, url, cachePrefix) {
  return new VectorLayer({
    minZoom: 6,
    extent: extentNorthernIreland,
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:&nbsp;©&nbsp;NIEA&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
      format: GeoJSONObjectID27700,
      projection: projection27700,
      loader: cachedFeaturesLoader(`${cachePrefix}-GB-NIR`),
      strategy: (extent) => (
        intersects(extent, extentNorthernIreland) ? cacheGridStrategy(extent) : []),
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
    layers.push(vectorLayerEngland(stylefunc, urlEngland, shortTitle));
  }
  if (urlScotland) {
    layers.push(vectorLayerScotland(stylefunc, urlScotland, shortTitle));
  }
  if (urlWales) {
    layers.push(vectorLayerWales(stylefunc, urlWales, shortTitle));
  }
  if (urlNorthernIreland) {
    layers.push(vectorLayerNorthernIreland(stylefunc, urlNorthernIreland, shortTitle));
  }
  return new LayerGroup({
    title: title,
    shortTitle: shortTitle,
    combine: true,
    visible: visible,
    minZoom: 6,
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

function gridLoader(source, prefixFunc, extent, projection, success, level) {
  const features = [];
  const newExtent = transformExtent(extent, projection27700, projection);
  let step = 100000;
  for (let n = 1; n < level; n += 1) {
    step /= 10;
  }
  const e0 = Math.floor(newExtent[0] / step) * step;
  const n0 = Math.floor(newExtent[1] / step) * step;
  const eN = Math.ceil(newExtent[2] / step) * step;
  const nN = Math.ceil(newExtent[3] / step) * step;
  for (let e = e0; e < eN + step; e += step) {
    for (let n = n0; n < nN + step; n += step) {
      const prefix = prefixFunc(e, n);
      if (prefix) {
        let grid = `${prefix}`;
        if (level > 1) {
          grid += String(Math.floor((e % 100000) / step)).padStart(level - 1, '0');
          grid += String(Math.floor((n % 100000) / step)).padStart(level - 1, '0');
        }
        const feature = new Feature({
          geometry: new Polygon(
            [[[e, n],
              [e + step, n],
              [e + step, n + step],
              [e, n + step],
              [e, n]]],
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

class RepeaterVectorSource extends VectorSource {
  constructor(options) {
    super({
      attributions: 'Repeaters:<a href="https://ukrepeater.net/" target="_blank">©&nbsp;ukreapter.net</a>',
      strategy: (extent) => (
        getMaidenheadGridFeatures27700(extent, 2).map(
          (feature) => (feature.getGeometry().getExtent()),
        )
      ),
      loader: function loader(extent, resolution, projection, success, failure) {
        const vectorSource = this;
        const [lon, lat] = getCenter(transformExtent(extent, projection27700, 'EPSG:4326'));
        const grid = getMaidenheadGrid(lon, lat, 2);
        const url = `https://api-beta.rsgb.online/locator/${grid}`;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = 'json';
        function onError() {
          vectorSource.removeLoadedExtent(extent);
          failure();
        }
        xhr.onerror = onError;
        xhr.onload = () => {
          const features = [];
          if (xhr.status === 200) {
            xhr.response.data.filter(
              (item) => (
                vectorSource.band === item.band
                && vectorSource.types.has(item.type)
                && item.modeCodes?.filter((x) => (vectorSource.modes.has(x[0]))).length > 0),
            ).forEach((item) => {
              const ngr = item.extraDetails?.ngr;
              if (ngr) {
                const feature = new Feature({
                  geometry: new Point(osGridToEastingNorthing(ngr)),
                  reference: item.repeater,
                  refUrl: item.id,
                  name: `${item.band} ${item.modeCodes.join('')}`,
                });
                feature.setId(item.id);
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
    });
    this.band = options.band;
    this.modes = options.modes;
    this.types = options.types;
  }
}

const bingGroup = new LayerGroup({
  title: 'Bing Imagery',
  shortTitle: 'BING',
  type: 'base',
  combine: true,
  visible: false,
  layers: [],
});

bingGroup.once('change:visible', () => {
  // Callback to only set layer when used
  // to avoid using API credits unnecessarily
  bingGroup.getLayers().push(new TileLayer({
    source: new BingMaps({
      key: import.meta.env.VITE_BING_APIKEY,
      imagerySet: 'Aerial',
    }),
  }));
});

// Used for layers switching between Circle and Polygon styles
const dataCache = {};
function withData(url, func, error) {
  if (dataCache[url] !== undefined) {
    func(dataCache[url]);
  } else {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'json';
    xhr.open('GET', url);
    xhr.onerror = error;
    xhr.onload = () => {
      if (xhr.status === 200) {
        dataCache[url] = new GeoJSONReference({
          dataProjection: projection27700,
        }).readFeaturesFromObject(xhr.response);
        func(dataCache[url]);
      } else {
        error();
      }
    };
    xhr.send();
  }
}

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
        bingGroup,
      ],
    }),
    new LayerGroup({
      title: 'Overlays',
      layers: [
        new LayerGroup({
          title: 'CI MGRS Grid (CI WAB Squares)',
          shortTitle: 'CIG',
          visible: false,
          combine: true,
          layers: [[1.5, 5], [5, 20]].map((zoom, level) => new VectorLayer({
            minZoom: zoom[0],
            maxZoom: zoom[1],
            extent: extentChannelIslands,
            style: gridStyle,
            source: new VectorSource({
              overlaps: false,
              strategy: bboxStrategy,
              loader: function loader(extent, resolution, projection, success) {
                return gridLoader(
                  this,
                  MGRSPrefix,
                  extent,
                  'EPSG:32630',
                  success,
                  level + 1,
                );
              },
            }),
          })),
        }),
        new LayerGroup({
          title: 'Irish Grid (NI WAB Squares)',
          shortTitle: 'IRG',
          visible: false,
          combine: true,
          layers: [[1.5, 5], [5, 20]].map((zoom, level) => new VectorLayer({
            minZoom: zoom[0],
            maxZoom: zoom[1],
            extent: extentIreland,
            style: gridStyle,
            source: new VectorSource({
              overlaps: false,
              strategy: bboxStrategy,
              loader: function loader(extent, resolution, projection, success) {
                return gridLoader(
                  this,
                  (e, n) => ((e >= 0) ? IrishPrefix(e, n) : null),
                  extent,
                  'EPSG:29902',
                  success,
                  level + 1,
                );
              },
            }),
          })),
        }),
        new LayerGroup({
          title: 'OS Grid (GB WAB Squares)',
          shortTitle: 'OSG',
          visible: false,
          combine: true,
          layers: [[1.5, 5], [5, 20]].map((zoom, level) => new VectorLayer({
            minZoom: zoom[0],
            maxZoom: zoom[1],
            extent: extend([...extentEngland], extentScotland),
            style: gridStyle,
            source: new VectorSource({
              overlaps: false,
              strategy: bboxStrategy,
              loader: function loader(extent, resolution, projection, success) {
                return gridLoader(
                  this,
                  (e, n) => {
                    try {
                      return OSGBPrefix(e, n);
                    } catch (error) {
                      return null;
                    }
                  },
                  extent,
                  projection,
                  success,
                  level + 1,
                );
              },
            }),
          })),
        }),
        new LayerGroup({
          title: 'Maidenhead Grid',
          shortTitle: 'MHG',
          visible: false,
          combine: true,
          layers: [[0, 2], [2, 6], [6, 20]].map((zoom, level) => new VectorLayer({
            minZoom: zoom[0],
            maxZoom: zoom[1],
            style: (feature) => new Style({
              stroke: new Stroke({
                color: 'rgba(255, 100, 100, 0.2)',
                width: 3,
              }),
              text: new Text({
                text: feature.getId(),
                font: 'bold 25px ui-rounded',
                stroke: new Stroke({color: 'rgba(255, 100, 100, 0.5)', width: 2}),
                fill: null,
              }),
            }),
            source: new VectorSource({
              projection: projection27700,
              overlaps: false,
              strategy: bboxStrategy,
              loader: function loader(extent, resolution, projection, success) {
                const features = getMaidenheadGridFeatures27700(extent, level + 1);
                this.addFeatures(features);
                success(features);
              },
            }),
          })),
        }),
      ],
    }),
    new LayerGroup({
      title: 'Repeaters',
      layers: [
        new VectorLayer({
          title: `${legendTriangle('#31eb85', 90)}${legendTriangle('#31eb85', 180)} 70cm (Digital/Mixed)`,
          shortTitle: 'REP70CMD',
          refUrl: 'https://ukrepeater.net/my_repeater.php?id=',
          minZoom: 6,
          visible: false,
          style: (feature, resolution) => triangleStyleFunction(feature, resolution, '#31eb85'),
          source: new RepeaterVectorSource({band: '70CM', modes: new Set('DMFPN'), types: new Set(['AV', 'DV', 'DM'])}),
        }),
        new VectorLayer({
          title: `${legendTriangle('#31eb85')}${legendTriangle('#31eb85', 180)} 70cm (Analogue/Mixed)`,
          shortTitle: 'REP70CMA',
          refUrl: 'https://ukrepeater.net/my_repeater.php?id=',
          minZoom: 6,
          visible: false,
          style: (feature, resolution) => triangleStyleFunction(feature, resolution, '#31eb85'),
          source: new RepeaterVectorSource({band: '70CM', modes: new Set('A'), types: new Set(['AV', 'DV', 'DM'])}),

        }),
        new VectorLayer({
          title: `${legendTriangle('#edb940', 90)}${legendTriangle('#edb940', 180)} 2m (Digital/Mixed)`,
          shortTitle: 'REP2MD',
          refUrl: 'https://ukrepeater.net/my_repeater.php?id=',
          minZoom: 6,
          visible: false,
          style: (feature, resolution) => triangleStyleFunction(feature, resolution, '#edb940'),
          source: new RepeaterVectorSource({band: '2M', modes: new Set('DMFPN'), types: new Set(['AV', 'DV', 'DM'])}),
        }),
        new VectorLayer({
          title: `${legendTriangle('#edb940')}${legendTriangle('#edb940', 180)} 2m (Analogue/Mixed)`,
          shortTitle: 'REP2MA',
          refUrl: 'https://ukrepeater.net/my_repeater.php?id=',
          minZoom: 6,
          visible: false,
          style: (feature, resolution) => triangleStyleFunction(feature, resolution, '#edb940'),
          source: new RepeaterVectorSource({band: '2M', modes: new Set('A'), types: new Set(['AV', 'DV', 'DM'])}),
        }),
      ],
    }),
    new LayerGroup({
      title: 'Designations',
      layers: [
        createLayerGroup(
          `${legendBox(colorCROW, false)} Open Access Land (CRoW Act)`,
          'CROW',
          polygonStyleFunctionCROW,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/CRoW_Act_2000_Access_Layer/FeatureServer/0/query?',
          null,
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_OPEN_COUNTRY_2014,inspire-nrw:NRW_COMMON_LAND_2014,inspire-nrw:NRW_PUBLIC_FOREST_2014,inspire-nrw:NRW_OTHER_STATUTORY_LAND_2014,inspire-nrw:NRW_OTHER_DEDICATED_LAND&',
          null,
          false,
        ),
        new LayerGroup({
          title: `${legendLine(colorNT)} National Trails / Coast Paths`,
          shortTitle: 'NT',
          combine: true,
          visible: true,
          minZoom: 6,
          layers: [
            vectorLayerEngland(lineStyleFunctionNT, 'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Trails_England/FeatureServer/0/query?', 'NT'),
            vectorLayerEngland((f, r) => lineStyleFunctionNT(f, r, 'King Charles III England Coast Path', true), 'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/England_Coast_Path_Route/FeatureServer/0/query?', 'NTCP'),
            vectorLayerWales(lineStyleFunctionNT, 'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_NATIONAL_TRAIL&', 'NT'),
            vectorLayerWales((f, r) => lineStyleFunctionNT(f, r, 'Wales Coast Path'), 'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_WALES_COASTAL_PATH&', 'NTCP'),
            vectorLayerScotland((f, r) => lineStyleFunctionNT(f, r, 'John Muir Way'), 'https://ogc.nature.scot/geoserver/landscape/wfs?service=wfs&typeName=landscape:jmw&', 'NTJMW'),
          ],
        }),
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
          minZoom: 6,
          layers: [
            createVectorLayerScotGov(polygonStyleFunctionNSA, 'PS:NationalScenicAreas', 'NSA'),
          ],
        }),
        new LayerGroup({
          title: `${legendBox(colorFP)} Forest Parks`,
          shortTitle: 'FP',
          combine: true,
          visible: false,
          minZoom: 6,
          layers: [
            new VectorLayer({
              minZoom: 6,
              style: polygonStyleFunctionFP,
              source: new VectorSource({
                attributions: 'Boundaries:&nbsp;©&nbsp;Forestry&nbsp;Commission&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
                format: new EsriJSON(),
                projection: projection27700,
                loader: cachedFeaturesLoader('FP'),
                strategy: cacheGridStrategy,
                url: (extent) => 'https://services2.arcgis.com/mHXjwgl3OARRqqD4/arcgis/rest/services/National_Forest_Estate_Forest_Parks_GB/FeatureServer/0/query?'
                  + 'f=json&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry='
                  + `{"xmin":${extent[0]},"xmax":${extent[2]},"ymin":${extent[1]},"ymax":${extent[3]},"spatialReference":{"wkid":27700}}&`
                  + 'geometryType=esriGeometryEnvelope&inSR=27700&outFields=OBJECTID,FOREST_PAR&outSR=27700',
              }),
            }),
          ],
        }),
        new LayerGroup({
          title: `${legendBox(colorNP)} National/Regional Parks`,
          shortTitle: 'NP',
          combine: true,
          visible: false,
          minZoom: 6,
          layers: [
            vectorLayerEngland(
              polygonStyleFunctionNP,
              'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Parks_England/FeatureServer/0/query?',
              'NP',
            ),
            vectorLayerWales(
              polygonStyleFunctionNP,
              'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_NATIONAL_PARK&',
              'NP',
            ),
            createVectorLayerScotGov(polygonStyleFunctionNP, 'PS:CairngormsNationalPark', 'NP'),
            createVectorLayerScotGov(polygonStyleFunctionNP, 'PS:LochLomondTrossachsNationalPark', 'NP'),
            vectorLayerScotland(
              polygonStyleFunctionNP,
              'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:rp&',
              'NP',
            ),
          ],
        }),
        createLayerGroup(
          `${legendBox(colorSSSI)} Sites of Special Scientific Interest`,
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
          minZoom: 6,
          layers: [
            new VectorLayer({
              minZoom: 6,
              style: polygonStyleFunctionRSPB,
              source: new VectorSource({
                attributions: 'Boundaries:&nbsp;RSPB&nbsp;Geographic&nbsp;Data&nbsp;End&nbsp;User&nbsp;Agreement.',
                format: new EsriJSON(),
                projection: projection27700,
                strategy: cacheGridStrategy,
                loader: cachedFeaturesLoader('RSPB'),
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
          title: `${legendDot('rgba(255, 100, 82, 0.5)')} Trigpoints (WAB Award)`,
          shortTitle: 'TRIG',
          refUrl: 'https://trigpointing.uk/trig/',
          visible: false,
          minZoom: 6,
          updateWhileInteracting: true,
          updateWhileAnimating: true,
          style: (feature, resolution) => pointStyleFunction(feature, resolution, 'rgba(255, 100, 82, 1)', 30 / resolution),
          source: new VectorSource({
            attributions: 'Trigpoints:&nbsp;<a href="https://trigpointing.uk/" target="_blank">TrigpointingUK</a>.',
            projection: projection27700,
            format: GeoJSON27700,
            url: TRIGPOINTS,
          }),
        }),
        new LayerGroup({
          title: `${legendDot('rgba(122, 174, 0, 0.5)')} UK Bunkers on the Air`,
          shortTitle: 'BOTA',
          combine: true,
          visible: false,
          minZoom: 6,
          layers: [
            new VectorLayer({
              refUrl: 'https://bunkerwiki.org/?s=',
              maxZoom: 11,
              updateWhileInteracting: true,
              updateWhileAnimating: true,
              style: (feature, resolution) => pointStyleFunction(feature, resolution, 'rgba(122, 174, 0, 1)', 1000 / resolution),
              source: new VectorSource({
                attributions: 'UKBOTA&nbsp;references:<a href="https://bunkersontheair.org/" target="_blank">©&nbsp;Bunkers&nbsp;on&nbsp;the&nbsp;Air</a>.',
                loader: function loader(extent, resolution, projection, success, failure) {
                  const vectorSource = this;
                  withData(
                    BOTA,
                    (BOTAfeatures) => {
                      vectorSource.addFeatures(BOTAfeatures);
                      success(BOTAfeatures);
                    },
                    () => {
                      vectorSource.removeLoadedExtent(extent);
                      failure();
                    },
                  );
                },
              }),
            }),
            new VectorLayer({
              refUrl: 'https://bunkerwiki.org/?s=',
              minZoom: 11,
              updateWhileInteracting: true,
              updateWhileAnimating: true,
              style: (feature, resolution) => polygonStyleFunction(feature, resolution, `${feature.get('reference')} ${feature.get('name')}`, 'rgba(122, 174, 0, 1)', true),
              source: new VectorSource({
                attributions: 'UKBOTA&nbsp;references:<a href="https://bunkersontheair.org/" target="_blank">©&nbsp;Bunkers&nbsp;on&nbsp;the&nbsp;Air</a>.',
                strategy: bboxStrategy,
                loader: function loader(extent, resolution, projection, success, failure) {
                  const vectorSource = this;
                  withData(
                    BOTA,
                    (features) => {
                      const newFeatures = [];
                      const expandedExtent = buffer(extent, 1000); // To capture centre point
                      features.forEach((feature) => {
                        const geometry = feature.getGeometry();
                        if (vectorSource.getFeatureById(feature.getId()) === null
                            && geometry.intersectsExtent(expandedExtent)) {
                          const coordinates = [];
                          const nSteps = 128;
                          const centerXY = geometry.getCoordinates();
                          for (let i = 0; i < nSteps + 1; i += 1) {
                            const angle = (2 * Math.PI * (i / nSteps)) % (2 * Math.PI);
                            const x = centerXY[0] + Math.cos(-angle) * 1000;
                            const y = centerXY[1] + Math.sin(-angle) * 1000;
                            coordinates.push([x, y]);
                          }
                          const newFeature = feature.clone();
                          newFeature.setGeometry(new Polygon([coordinates]));
                          newFeature.setId(feature.getId()); // ID reset on clone
                          newFeatures.push(newFeature);
                        }
                      });
                      vectorSource.addFeatures(newFeatures);
                      success(newFeatures);
                    },
                    () => {
                      vectorSource.removeLoadedExtent(extent);
                      failure();
                    },
                  );
                },
              }),
            }),
          ],
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
              const code = extentToCode(extent);
              if (!code) {
                failure(); // shouldn't ever get here
                return;
              }
              const url = `https://api-db2.sota.org.uk/api/associations/${code}`;
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
                    const rUrl = `https://api-db2.sota.org.uk/api/regions/${region.associationCode}/${region.regionCode}`;
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
              const code = extentToCode(extent);
              if (!code) {
                failure(); // shouldn't ever get here
                return;
              }
              const url = `https://www.cqgma.org/mvs/aaawff.php?r=${code}`;
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
            strategy: (extent) => {
              const newExtent = transformExtent(extent, projection27700, 'EPSG:4326');
              const [x0, y0, xN, yN] = [
                Math.floor(newExtent[0]),
                Math.floor(newExtent[1] * 2) / 2,
                Math.ceil(newExtent[2]),
                Math.ceil(newExtent[3] * 2) / 2];
              const extents = [];
              for (let x = x0; x < xN; x += 1) {
                for (let y = y0; y < yN; y += 0.5) {
                  extents.push(transformExtent([x, y, x + 1, y + 0.5], 'EPSG:4326', projection27700));
                }
              }
              return extents;
            },
            url: (extent) => {
              const newExtent = transformExtent(extent, projection27700, 'EPSG:4326');
              const [minLon, minLat, maxLon, maxLat] = [
                Math.round(newExtent[0]),
                Math.round(newExtent[1] * 2) / 2,
                Math.round(newExtent[2]),
                Math.round(newExtent[3] * 2) / 2];
              return `https://api.pota.app/park/grids/${minLat}/${minLon}/${maxLat}/${maxLon}/0`;
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
      if (shortTitle) {
        if (layers.includes(shortTitle)
            || (layers.includes('REP2M') && shortTitle.startsWith('REP2M'))
            || (layers.includes('REP70CM') && shortTitle.startsWith('REP70CM'))) {
          layer.setVisible(true);
        } else {
          layer.setVisible(false);
        }
      }
    });
  }
}
layersLinkCallback(link.track('layers', layersLinkCallback));
let initialLocate = !link.track('x', () => {});
const initialZoom = parseFloat(link.track('z', () => {}));
map.once('movestart', () => { // initial centre map call
  // Don't move map if user already interacted with it
  map.on('movestart', () => { initialLocate = false; });
});

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
  const refs = new Set();
  const content = document.createElement('ul');
  map.forEachFeatureAtPixel(
    event.pixel,
    (feature, layer) => {
      const ref = feature.get('reference');
      if (!refs.has(ref)) {
        refs.add(ref);

        let url = layer.get('refUrl');
        if (feature.get('refUrl')) {
          url += feature.get('refUrl');
        } else {
          url += ref;
        }
        const refLink = document.createElement('a');
        refLink.href = url;
        refLink.textContent = `${ref} ${feature.get('name')}`;
        refLink.target = '_blank';

        const listItem = document.createElement('li');
        listItem.appendChild(refLink);
        content.appendChild(listItem);
      }
    },
    {
      layerFilter: (layer) => layer.get('refUrl'),
      hitTolerance: 2,
    },
  );
  if (content.hasChildNodes()) { popup.show(event.coordinate, content); }
});

const zoomInLayer = new VectorLayer({
  style: new Style({
    text: new Text({
      text: 'Zoom In',
      font: '30px ui-rounded',
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
      if (resolution >= 85) { // zoom > 6
        this.addFeature(
          new Feature({
            geometry: new Point([
              (extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2,
            ]),
          }),
        );
      }
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
  style: (feature, resolution) => {
    if (feature.getGeometry().getType() === 'Point') {
      return new Style({
        text: createTextStyle(feature, resolution, feature.get('text'), '#AAAAFF', 2),
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({color: '#AAAAFF'}),
          stroke: new Stroke({color: '#0000FF', width: 1}),
        }),
      });
    }
    return polygonStyleFunction(feature, resolution, null, '#AAAAFF50');
  },
});
map.addLayer(layer);

function locateFunc(zoom = 12) {
  if (!source.isEmpty()) {
    map.getView().fit(source.getExtent(), {
      maxZoom: zoom,
      duration: 500,
    });
  }
}

navigator.geolocation.watchPosition(
  (pos) => {
    const coords = [pos.coords.longitude, pos.coords.latitude];
    const accuracy = circular(coords, pos.coords.accuracy);
    const [e, n] = fromLonLat(coords, projection27700);
    source.clear(true);
    if (containsCoordinate(projection27700.getExtent(), [e, n])) {
      const features = [new Feature({
        geometry: new Point([e, n]),
        text: `${getMaidenheadGrid(...coords, 3)}\n${locationToWABSquare(e, n)}`,
      })];
      if (pos.coords.accuracy <= 1000) {
        features.push(new Feature(accuracy.transform('EPSG:4326', projection27700)));
      }
      source.addFeatures(features);
      if (initialLocate) {
        initialLocate = false;
        locateFunc(initialZoom || 6.01);
      }
    }
  },
  () => {},
  {
    enableHighAccuracy: true,
  },
);

const locate = document.createElement('div');
locate.className = 'ol-control ol-unselectable locate';
locate.innerHTML = '<button title="Locate me">◎</button>';
locate.addEventListener('click', () => locateFunc());
map.addControl(
  new Control({
    element: locate,
  }),
);

const textIncrease = document.createElement('div');
textIncrease.className = 'ol-control ol-unselectable text-increase';
textIncrease.innerHTML = '<button title="Text Size Increase"><div style="font-size: x-large">A</div></button>';
textIncrease.addEventListener('click', () => {
  mapOptions.textSize ||= 1.0;
  mapOptions.textSize += 0.1;
  localStorage.setItem('textSize', mapOptions.textSize.toFixed(1));
  map.redrawText();
});
map.addControl(
  new Control({
    element: textIncrease,
  }),
);

const textDecrease = document.createElement('div');
textDecrease.className = 'ol-control ol-unselectable text-decrease';
textDecrease.innerHTML = '<button title="Text Size Decrease"><div style="font-size: x-small">A</div></button>';
textDecrease.addEventListener('click', () => {
  mapOptions.textSize ||= 1.0;
  mapOptions.textSize -= 0.1;
  mapOptions.textSize = Math.max(mapOptions.textSize, 0.1);
  localStorage.setItem('textSize', mapOptions.textSize.toFixed(1));
  map.redrawText();
});
map.addControl(
  new Control({
    element: textDecrease,
  }),
);

const layerSwitcher = new LayerSwitcher({
  reverse: true,
  groupSelectStyle: 'none',
  startActive: true,
});
map.addControl(layerSwitcher);
