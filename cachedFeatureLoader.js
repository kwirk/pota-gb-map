import { loadFeaturesXhr } from 'ol/featureloader';
import { GeoJSON } from 'ol/format';

const geoJSON = new GeoJSON({dataProjection: 'EPSG:27700'});

let db;
const request = indexedDB.open('featureStore', 2);
request.onsuccess = (event) => {
  db = event.target.result;
};
request.onupgradeneeded = (event) => {
  if (event.oldVersion === 0) { // New database
    const extentsStore = event.target.result.createObjectStore('extents', {keyPath: ['cache', 'extent']});
    extentsStore.createIndex('expire', 'expire', {unique: false});
    const featuresStore = event.target.result.createObjectStore('features', {keyPath: ['cache', 'id']});
    featuresStore.createIndex('expire', 'expire', {unique: false});
  }
  if (event.oldVersion === 1) { // Upgrade v1 to v2
    event.target.transaction.objectStore('extents').createIndex('expire', 'expire', {unique: false});
    const featuresStore = event.target.transaction.objectStore('features');
    featuresStore.clear(); // Missing expire values. Easier to clear.
    featuresStore.createIndex('expire', 'expire', {unique: false});
  }
};

function delExpiredCache() {
  const range = IDBKeyRange.upperBound(new Date());
  const transaction = db.transaction(['extents', 'features'], 'readwrite');
  const extentsStore = transaction.objectStore('extents');
  const featuresStore = transaction.objectStore('features');
  extentsStore.index('expire').openKeyCursor(range).onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      extentsStore.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  featuresStore.index('expire').openKeyCursor(range).onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      featuresStore.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
}

function getCachedExtent(cache, extent, success, failure) {
  if (db !== undefined) {
    const extentRequest = db.transaction('extents').objectStore('extents').get([cache, extent]);
    extentRequest.onsuccess = (event) => {
      if (event.target.result !== undefined) success(event); else failure(event);
    };
    extentRequest.onerror = failure;
  } else {
    failure();
  }
}

function getCachedFeatures(cache, ids, addFeatures, success, failure) {
  if (db !== undefined) {
    const features = [];
    let featureFailure = false;
    const transaction = db.transaction('features');
    transaction.oncomplete = () => {
      addFeatures(features);
      if (!featureFailure) success(features); else failure();
    };
    transaction.onabort = failure;

    const featuresRequest = transaction.objectStore('features');
    ids.forEach((id) => {
      const featureRequest = featuresRequest.get([cache, id]);
      featureRequest.onsuccess = (event) => {
        if (event.target.result !== undefined) {
          const feature = geoJSON.readFeature(event.target.result.feature);
          features.push(feature);
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
    transaction.onabort = (event) => {
      if (event.target.error.name === 'QuotaExceededError') {
        delExpiredCache();
      }
    };

    const expire = new Date();
    expire.setDate(expire.getDate() + 14);
    const featuresRequest = transaction.objectStore('features');
    features.forEach((feature) => {
      featuresRequest.put({
        cache,
        id: feature.getId(),
        expire,
        feature: geoJSON.writeFeatureObject(feature, {decimals: 0}),
      });
    });

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
            (features) => { source.addFeatures(features); },
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
          noCacheLoad(loadCachedFeatures)();
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
