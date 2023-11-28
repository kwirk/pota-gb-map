import './style.css';
import 'ol-layerswitcher/dist/ol-layerswitcher.css';

import {Feature, Map, View} from 'ol';
import LayerGroup from 'ol/layer/Group';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import WMTS, {optionsFromCapabilities} from 'ol/source/WMTS';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import {bbox as bboxStrategy} from 'ol/loadingstrategy';
import proj4 from 'proj4';
import {register} from 'ol/proj/proj4';
import {Projection, fromLonLat, transformExtent} from 'ol/proj';
import {containsExtent as contains, intersects} from 'ol/extent';
import {EsriJSON, GeoJSON, WMTSCapabilities} from 'ol/format';
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
import LayerSwitcher from 'ol-layerswitcher';

// Setup the EPSG:27700 (British National Grid) projection.
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');
register(proj4);
const projection27700 = new Projection({
  code: 'EPSG:27700',
  extent: [-90607.34, -12247.02, 682220.39, 1247821.27],
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

// Based on ONS mix/max county boundaries
const extentEngland = transformExtent([-6.3021698, 49.92332077, 1.64949596, 55.30036926], 'EPSG:4326', projection27700);
const extentScotland = transformExtent([-6.65721989, 55.09621811, -1.37344003, 60.50495148], 'EPSG:4326', projection27700);
const extentWales = transformExtent([-4.90818024, 51.44837952, -2.89769006, 53.27944946], 'EPSG:4326', projection27700);

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
    }
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
function createTextStyle(feature, resolution, text, color) {
  return new Text({
    text: text,
    font: 'bold ui-rounded',
    textAlign: 'center',
    fill: new Fill({color: '#000000'}),
    stroke: new Stroke({color: color, width: 1}),
    offsetY: 15,
    overflow: (resolution < 15),
  });
}

function pointStyleFunction(feature, resolution) {
  let text = feature.get('reference');
  if (resolution < 40) {
    text += ` ${feature.get('name')}`;
  }
  return new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({color: '#FFFF00'}),
      stroke: new Stroke({color: '#000000', width: 1}),
    }),
    text: createTextStyle(feature, resolution, text, '#FFFF00'),
  });
}

function colorOpacity(color) {
  return color.replace(/[\d.]+\)$/g, '0.2)');
}

function legendBox(color) {
  return `<div class="box" style="background-color: ${colorOpacity(color)}; border-color: ${color}"></div>`;
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
      attributions: 'Boundaries:&nbsp;Contains&nbsp;public&nbsp;sector&nbsp;information&nbsp;licensed&nbsp;under&nbsp;the&nbsp;<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>.',
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
    style: stylefunc,
    source: new VectorSource({
      attributions: 'Boundaries:©&nbsp;Natural&nbsp;England&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).',
      format: new EsriJSON(),
      projection: projection27700,
      strategy: (extent) => (
        (intersects(extent, extentEngland) && !contains(extentWales, extent)) ? [extent] : []),
      url: (extent) => `${url}f=json&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=`
        + `{"xmin":${extent[0]},"xmax":${extent[2]},"ymin":${extent[1]},"ymax":${extent[3]},"spatialReference":{"wkid":27700}}&`
        + 'geometryType=esriGeometryEnvelope&inSR=27700&outFields=*&outSR=27700',
    }),
  });
}

function vectorLayerScotland(stylefunc, url) {
  return createVectorLayer(stylefunc, url, extentScotland);
}
function vectorLayerWales(stylefunc, url) {
  return createVectorLayer(stylefunc, url, extentWales);
}

function createLayerGroup(title, stylefunc, urlEngland, urlScotland, urlWales, visible = true) {
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
  return new LayerGroup({
    title: title,
    combine: true,
    visible: visible,
    layers: layers,
  });
}

const apiKey = import.meta.env.VITE_OS_APIKEY;
const parser = new WMTSCapabilities();
fetch(`https://api.os.uk/maps/raster/v1/wmts?key=${apiKey}&service=WMTS&request=GetCapabilities&version=2.0.0`)
  .then((response) => response.text())
  .then((text) => {
    const result = parser.read(text);
    const options = optionsFromCapabilities(result, {
      layer: 'Light_27700',
      matrixSet: 'EPSG:27700',
    });

    const baseSource = new WMTS(options);
    baseSource.setAttributions('Map:&nbsp;OS&nbsp;©Crown&nbsp;copyright&nbsp;and&nbsp;database&nbsp;right&nbsp;(<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">OGL</a>).');
    const map = new Map({
      target: 'map',
      controls: [new Zoom(), new Rotate(), new ScaleLine()],
      view: new View({
        projection: projection27700,
        center: fromLonLat([-4, 54], projection27700),
        zoom: 2,
        maxZoom: 11, // Max of OS API Free
      }),
      layers: [
        new LayerGroup({
          title: 'Base maps',
          layers: [
            new TileLayer({
              title: 'Ordnance Survey',
              type: 'base',
              source: baseSource,
            }),
            new TileLayer({
              title: 'OSM',
              type: 'base',
              visible: false,
              source: new OSM({
                attributions: 'Map:&nbsp;©<a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>&nbsp;contributors.',
              }),
            }),
            new TileLayer({
              title: 'OpenTopoMap',
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
        new VectorLayer({
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
        }),
        new LayerGroup({
          title: 'Overlays',
          minZoom: 6,
          visible: false,
          layers: [
            new VectorLayer({
              title: 'OS Grid (WAB Squares)',
              visible: false,
              style: function style(feature) {
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
              },
              source: new VectorSource({
                projection: projection27700,
                overlaps: false,
                strategy: bboxStrategy,
                loader: function loader(extent, number, projection, success) {
                  const features = [];
                  const e0 = Math.max(Math.floor(extent[0] / 10000), 0);
                  const n0 = Math.max(Math.floor(extent[1] / 10000), 0);
                  const eN = Math.min(Math.ceil(extent[2] / 10000), 69);
                  const nN = Math.min(Math.ceil(extent[3] / 10000), 129);
                  for (let e = e0; e < eN + 1; e += 1) {
                    for (let n = n0; n < nN + 1; n += 1) {
                      const prefix = osGridPrefixes[Math.floor(n / 10)][Math.floor(e / 10)];
                      const grid = `${prefix}${Math.floor(e % 10)}${Math.floor(n % 10)}`;
                      const feature = new Feature({
                        geometry: new Polygon(
                          [[[e * 10000, n * 10000],
                            [e * 10000 + 10000, n * 10000],
                            [e * 10000 + 10000, n * 10000 + 10000],
                            [e * 10000, n * 10000 + 10000],
                            [e * 10000, n * 10000]]],
                        ),
                      });
                      feature.setId(grid);
                      features.push(feature);
                    }
                  }
                  this.addFeatures(features);
                  success(features);
                },
              }),
            }),
          ],
        }),
        createLayerGroup(
          `${legendBox(colorAONB)} Areas of Outstanding Natural Beauty`,
          polygonStyleFunctionAONB,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Areas_of_Outstanding_Natural_Beauty_England/FeatureServer/0/query?',
          null, // National Scenic Areas below
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_AONB&',
          false,
        ),
        new LayerGroup({
          title: `${legendBox(colorAONB)} National Scenic Areas`,
          combine: true,
          visible: false,
          layers: [
            createVectorLayerScotGov(polygonStyleFunctionNSA, 'PS:NationalScenicAreas'),
          ],
        }),
        new LayerGroup({
          title: `${legendBox(colorNP)} National Parks`,
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
          polygonStyleFunctionSSSI,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/SSSI_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:sssi&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_SSSI&',
          false,
        ),
        createLayerGroup(
          `${legendBox(colorSAC)} Special Areas of Conservation`,
          polygonStyleFunctionSAC,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Special_Areas_of_Conservation_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:sac&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_SAC&',
          false,
        ),
        createLayerGroup(
          `${legendBox(colorSPA)} Special Protection Areas`,
          polygonStyleFunctionSPA,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Special_Protection_Areas_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:spa&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_SPA&',
          false,
        ),
        createLayerGroup(
          `${legendBox(colorCPK)} Country Parks`,
          polygonStyleFunctionCPK,
          'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Country_Parks_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:cpk&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=geonode:country_parks&',
        ),
        createLayerGroup(
          `${legendBox(colorNNR)} National Nature Reserves`,
          polygonStyleFunctionNNR,
          'https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/National_Nature_Reserves_England/FeatureServer/0/query?',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:nnr&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_NNR&',
        ),
        new LayerGroup({
          title: `${legendBox(colorRSPB)} RSPB Reserves`,
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
        new VectorLayer({
          minZoom: 6,
          style: pointStyleFunction,
          source: new VectorSource({
            attributions: 'POTA&nbsp;references:&nbsp;<a href="https://parksontheair.com/" target="_blank">Parks&nbsp;on&nbsp;the&nbsp;Air®.</a>',
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
            projection: projection27700,
            format: new GeoJSON({featureProjection: projection27700}),
          }),
        }),
      ],
    });

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
  });
