export const dumpUserLocation = userLocation => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [userLocation.location.coordinates[0], userLocation.location.coordinates[1]],
  },
  properties: {
    time: userLocation.time,
  },
})

export const dumpPlace = place => ({
  type: place.type,
  geometry: {
    type: place.geometry.type,
    coordinates: [place.geometry.coordinates[0], place.geometry.coordinates[1]],
  },
  properties: {
    placeId: place.properties.placeId,
    name: place.properties.name,
    address: place.properties.address,
    busyPercentage: place.properties.busyPercentage,
  },
})

export const dumpIntersection = intersection => ({
  count: intersection.count,
  date: intersection.date,
})

export const dumpError = error => ({
  message: error.message,
  status: error.statusCode || 502,
  code: error.body && error.body.code ? error.body.code : 'Error',
})

export const dumpLinestring = linestring => ({
  type: 'LineString',
  coordinates: linestring.coordinates || [],
})
