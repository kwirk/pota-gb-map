import './style.css';
import 'ol-layerswitcher/dist/ol-layerswitcher.css';
import {Map, View} from 'ol';
import LayerGroup from 'ol/layer/Group';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import WMTS, {optionsFromCapabilities} from 'ol/source/WMTS';
import proj4 from 'proj4';
import {register} from 'ol/proj/proj4';
import Projection from 'ol/proj/Projection';
import {intersects} from 'ol/extent';
import GeoJSON from 'ol/format/GeoJSON';
import EsriJSON from 'ol/format/EsriJSON';
import {fromLonLat, transformExtent} from 'ol/proj';
import {bbox as bboxStrategy} from 'ol/loadingstrategy';
import {
  Circle as CircleStyle,
  Fill,
  Stroke,
  Style,
  Text,
} from 'ol/style';
import {circular} from 'ol/geom/Polygon';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Control from 'ol/control/Control';
import LayerSwitcher from 'ol-layerswitcher';

// Setup the EPSG:27700 (British National Grid) projection.
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');
register(proj4);
const projection27700 = new Projection({
  code: 'EPSG:27700',
  extent: [-90607.34, -12247.02, 682220.39, 1247821.27],
});

// Based on ONS mix/max county boundaries
const extentEngland = transformExtent([-6.3021698, 49.92332077, 1.64949596, 55.30036926], 'EPSG:4326', projection27700);
const extentScotland = transformExtent([-6.65721989, 55.09621811, -1.37344003, 60.50495148], 'EPSG:4326', projection27700);
const extentWales = transformExtent([-4.90818024, 51.44837952, -2.89769006, 53.27944946], 'EPSG:4326', projection27700);

const GeoJSON27700 = new GeoJSON({
  dataProjection: projection27700,
  featureProjection: projection27700,
});

// Styles
function createTextStyle(feature, resolution, text, color) {
  return new Text({
    text: text,
    font: 'bold ui-rounded',
    textAlign: 'center',
    fill: new Fill({color: '#000000'}),
    stroke: new Stroke({color: color, width: 1}),
    offsetY: 15,
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

function polygonStyleFunction(feature, resolution, text, color) {
  return new Style({
    stroke: new Stroke({
      color: color,
      width: 3,
    }),
    fill: new Fill({
      color: color.replace(/[\d.]+\)$/g, '0.2)'),
    }),
    text: createTextStyle(feature, resolution, text, color),
  });
}

function polygonStyleFunctionSSSI(feature, resolution) {
  let text = feature.get('NAME');
  if (text === undefined) {
    text = feature.get('sssi_name');
  }
  return polygonStyleFunction(feature, resolution, text, 'rgba(0, 246, 171, 1)');
}

function polygonStyleFunctionNNR(feature, resolution) {
  let text = feature.get('NAME');
  if (text === undefined) {
    text = feature.get('NNR_Name');
  }
  if (text === undefined) {
    text = feature.get('nnr_name');
  }
  return polygonStyleFunction(feature, resolution, text, 'rgba(164, 180, 0, 1)');
}

function polygonStyleFunctionCPK(feature, resolution) {
  let text = feature.get('NAME');
  if (text === undefined) {
    text = feature.get('Name');
  }
  if (text === undefined) {
    text = feature.get('name');
  }
  return polygonStyleFunction(feature, resolution, text, 'rgba(255, 180, 0, 1)');
}

function polygonStyleFunctionAONB(feature, resolution) {
  let text = feature.get('AONB_NAME');
  if (text === undefined) {
    text = feature.get('name');
  }
  return polygonStyleFunction(feature, resolution, text, 'rgba(247, 0, 0, 1)');
}

function polygonStyleFunctionNSA(feature, resolution) {
  const text = feature.get('NSAName');
  return polygonStyleFunction(feature, resolution, text, 'rgba(247, 0, 0, 1)');
}

function polygonStyleFunctionSAC(feature, resolution) {
  let text = feature.get('NAME');
  if (text === undefined) {
    text = feature.get('SAC_name');
  }
  if (text === undefined) {
    text = feature.get('sac_name');
  }
  return polygonStyleFunction(feature, resolution, text, 'rgba(126, 0, 76, 1)');
}

function polygonStyleFunctionRSPB(feature, resolution) {
  const text = feature.get('Name');
  return polygonStyleFunction(feature, resolution, text, 'rgba(76, 0, 126, 1)');
}

function createVectorLayer(title, stylefunc, url, extentCountry) {
  return new VectorLayer({
    title: title,
    minZoom: 6,
    extent: extentCountry,
    style: stylefunc,
    source: new VectorSource({
      attributions: '<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">Open Government Licence.</a>',
      projection: projection27700,
      format: GeoJSON27700,
      strategy: (extent) => (intersects(extent, extentCountry) ? [extent] : []),
      url: (extent) => `${url}version=2.0.0&request=GetFeature&outputFormat=application/json&srsname=EPSG:27700&bbox=${extent}`,
    }),
  });
}

function vectorLayerEngland(title, stylefunc, url) {
  return createVectorLayer(`${title} - England`, stylefunc, url, extentEngland);
}
function vectorLayerScotland(title, stylefunc, url) {
  return createVectorLayer(`${title} - Scotland`, stylefunc, url, extentScotland);
}
function vectorLayerWales(title, stylefunc, url) {
  return createVectorLayer(`${title} - Wales`, stylefunc, url, extentWales);
}

function createLayerGroup(title, stylefunc, urlEngland, urlScotland, urlWales, visible = true) {
  const layers = [];
  if (urlEngland) {
    layers.push(vectorLayerEngland(title, stylefunc, urlEngland));
  }
  if (urlScotland) {
    layers.push(vectorLayerScotland(title, stylefunc, urlScotland));
  }
  if (urlWales) {
    layers.push(vectorLayerWales(title, stylefunc, urlWales));
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
    baseSource.setAttributions('<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">Open Government Licence.</a>');
    const map = new Map({
      target: 'map',
      view: new View({
        projection: projection27700,
        center: fromLonLat([-4, 54], projection27700),
        zoom: 2,
        maxZoom: 11, // Max of OS API Free
      }),
      layers: [
        new TileLayer({
          source: baseSource,
        }),
        createLayerGroup(
          'Areas of Outstanding Natural Beauty',
          polygonStyleFunctionAONB,
          'https://environment.data.gov.uk/spatialdata/areas-of-outstanding-natural-beauty-england/wfs?service=WFS&'
            + 'typeName=dataset-0c1ea47f-3c79-47f0-b0ed-094e0a136971:Areas_of_Outstanding_Natural_Beauty_England&',
          null, // National Scenic Areas below
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_AONB&',
          false,
        ),
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
            attributions: '<a href="https://github.com/kwirk/pota-gb-map" target="_blank">Developed by Steven Hiscocks M1SDH.</a>',
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
          title: 'National Scenic Areas',
          combine: true,
          visible: false,
          layers: [
            new VectorLayer({
              title: 'National Scenic Areas - Scotland',
              minZoom: 6,
              extent: extentScotland,
              style: polygonStyleFunctionNSA,
              source: new VectorSource({
                attributions: '<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank">Open Government Licence.</a>',
                projection: projection27700,
                format: new EsriJSON(),
                strategy: (extent) => (intersects(extent, extentScotland) ? [extent] : []),
                url: (extent) => 'https://maps.gov.scot/server/services/ScotGov/ProtectedSites/MapServer/WFSServer?service=WFS&'
                    + 'typeName=PS:NationalScenicAreas&outputFormat=ESRIGEOJSON&version=2.0.0&'
                    + `request=GetFeature&srsname=EPSG%3A27700&bbox=${extent}`,
              }),
            }),
          ],
        }),
        createLayerGroup(
          'Special Sites of Scientific Interest',
          polygonStyleFunctionSSSI,
          'https://environment.data.gov.uk/spatialdata/sites-of-special-scientific-interest-england/wfs?service=WFS&'
            + 'typeName=dataset-ba8dc201-66ef-4983-9d46-7378af21027e:Sites_of_Special_Scientific_Interest_England&',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:sssi&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_SSSI&',
          false,
        ),
        createLayerGroup(
          'Special Areas of Conservation',
          polygonStyleFunctionSAC,
          'https://environment.data.gov.uk/spatialdata/special-areas-of-conservation-england/wfs?service=WFS&'
            + 'typeName=dataset-6ecea2a1-5d2e-4f53-ba1f-690f4046ed1c:Special_Areas_of_Conservation_England&',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:sac&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_SAC&',
          false,
        ),
        createLayerGroup(
          'Country Parks',
          polygonStyleFunctionCPK,
          'https://environment.data.gov.uk/spatialdata/country-parks-england/wfs?service=WFS&'
            + 'typeName=dataset-697b86c9-5dce-4b60-9241-e590bf1d3a99:Country_Parks_England&',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:cpk&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=geonode:country_parks&',
        ),
        createLayerGroup(
          'National Nature Reserves',
          polygonStyleFunctionNNR,
          'https://environment.data.gov.uk/spatialdata/national-nature-reserves-england/wfs?service=WFS&'
            + 'typeName=dataset-ff213e4c-423a-4d7e-9e6f-b220600a8db3:National_Nature_Reserves_England&',
          'https://ogc.nature.scot/geoserver/protectedareas/wfs?service=wfs&typeName=protectedareas:nnr&',
          'https://datamap.gov.wales/geoserver/wfs?service=wfs&typeName=inspire-nrw:NRW_NNR&',
        ),
        new LayerGroup({
          title: 'RSPB Reserves',
          combine: true,
          layers: [
            new VectorLayer({
              title: 'RSPB Reserves',
              minZoom: 6,
              style: polygonStyleFunctionRSPB,
              source: new VectorSource({
                attributions: 'RSPB Geographic Data End User Agreement.',
                format: new EsriJSON(),
                projection: projection27700,
                strategy: bboxStrategy,
                url: (extent) => {
                  const srid = projection27700
                    .getCode()
                    .split(/:(?=\d+$)/)
                    .pop();
                  return 'https://services1.arcgis.com/h1C9f6qsGKmqXsVs/ArcGIS/rest/services/RSPB_Public_Reserves/FeatureServer/0/query/?'
                  + 'f=json&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry='
                  + `{"xmin":${extent[0]},"xmax":${extent[2]},"ymin":${extent[1]},"ymax":${extent[3]},"spatialReference":{"wkid":${srid}}}&`
                  + `geometryType=esriGeometryEnvelope&inSR=${srid}&outFields=OBJECTID,Name&outSR=${srid}&where=Access%3D'Publicised Reserve'`;
                },
              }),
            }),
          ],
        }),
        new VectorLayer({
          minZoom: 6,
          style: pointStyleFunction,
          source: new VectorSource({
            attributions: '<a href="https://parksontheair.com/" target="_blank">Parks on the Air®.</a>',
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
      groupSelectStyle: 'group',
      startActive: true,
    });
    map.addControl(layerSwitcher);
  });
