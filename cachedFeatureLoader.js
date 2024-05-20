import { loadFeaturesXhr } from 'ol/featureloader';
import { GeoJSON } from 'ol/format';

const geoJSON = new GeoJSON({dataProjection: 'EPSG:27700'});

let db;
const request = indexedDB.open('featureStore', 1);
request.onsuccess = (event) => {
  db = event.target.result;
};
request.onupgradeneeded = (event) => {
  event.target.result.createObjectStore('extents', {keyPath: ['cache', 'extent']});
  event.target.result.createObjectStore('features', {keyPath: ['cache', 'id']});
};

function getCachedExtent(cache, extent, success, failure) {
  if (db !== undefined) {
    const extentRequest = db.transaction('extents').objectStore('extents').get([cache, extent]);
    extentRequest.onsuccess = (event) => (
      (event.target.result !== undefined) ? success(event) : failure(event)
    );
    extentRequest.onerror = failure;
  } else {
    failure();
  }
}

function getCachedFeatures(cache, ids, featureSuccess, success, failure) {
  if (db !== undefined) {
    const features = [];
    let featureFailure = false;
    const transaction = db.transaction('features');
    transaction.oncomplete = () => (!featureFailure ? success(features) : failure());
    transaction.onerror = failure;

    const featuresRequest = transaction.objectStore('features');
    ids.forEach((id) => {
      const featureRequest = featuresRequest.get([cache, id]);
      featureRequest.onsuccess = (event) => {
        if (event.target.result !== undefined) {
          const feature = geoJSON.readFeature(event.target.result.feature);
          features.push(feature);
          featureSuccess(feature);
        } else {
          // Missing feature
          featureFailure = true;
        }
      };
    });
  } else {
    failure();
  }
}

function setCachedFeatures(cache, extent, features) {
  if (db !== undefined) {
    const transaction = db.transaction(['extents', 'features'], 'readwrite');
    const featuresRequest = transaction.objectStore('features');
    features.forEach((feature) => {
      featuresRequest.put({
        cache, id: feature.getId(), feature: geoJSON.writeFeatureObject(feature, {decimals: 0}),
      });
    });

    const expire = new Date();
    expire.setDate(expire.getDate() + 14);
    const extentRequest = transaction.objectStore('extents');
    extentRequest.put({
      cache, extent, expire, ids: features.map((feature) => feature.getId()),
    });
  }
}

export function cachedFeaturesLoader(cache) {
  return function loader(
    extent,
    resolution,
    projection,
    success,
    failure,
  ) {
    const source = this;
    let url = source.getUrl();
    url = typeof url === 'function' ? url(extent, resolution, projection) : url;
    const format = source.getFormat();

    let hasRefreshed = false;
    function noCacheLoad(customFailure) {
      return () => {
        if (!hasRefreshed) {
          hasRefreshed = true;
          loadFeaturesXhr(
            url,
            format,
            extent,
            resolution,
            projection,
            (features) => {
              source.addFeatures(features);
              setCachedFeatures(cache, extent, features);
              if (success !== undefined) {
                success(features);
              }
            },
            customFailure,
          );
        } else {
          // Trying again, meaning must have failed.
          customFailure();
        }
      };
    }

    getCachedExtent(
      cache,
      extent,
      (extentEvent) => {
        function loadCachedFeatures() {
          return getCachedFeatures(
            cache,
            extentEvent.target.result.ids,
            (feature) => source.addFeature(feature),
            success,
            noCacheLoad(() => {
              source.removeLoadedExtent(extent);
              if (failure !== undefined) {
                failure();
              }
            }),
          );
        }
        if (extentEvent.target.result.expire > new Date()) {
          loadCachedFeatures();
        } else {
          noCacheLoad(loadCachedFeatures);
        }
      },
      noCacheLoad(() => {
        source.removeLoadedExtent(extent);
        if (failure !== undefined) {
          failure();
        }
      }),
    );
  };
}

export function cacheGridStrategy(extent) {
  const [x0, y0, xN, yN] = [
    Math.floor(extent[0] / 50000) * 50000,
    Math.floor(extent[1] / 50000) * 50000,
    Math.ceil(extent[2] / 50000) * 50000,
    Math.ceil(extent[3] / 50000) * 50000,
  ];
  const extents = [];
  for (let x = x0; x < xN; x += 50000) {
    for (let y = y0; y < yN; y += 50000) {
      extents.push([x, y, x + 50000, y + 50000]);
    }
  }
  return extents;
}
