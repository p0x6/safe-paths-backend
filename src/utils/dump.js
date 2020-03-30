export const dumpUserLocation = userLocation => ({
  location: {

    longitude: userLocation.location.coordinates[0],
    latitude: userLocation.location.coordinates[1],
  },
  time: userLocation.time,
})

export const dumpIntersection = intersection => ({
  count: intersection.count,
  date: intersection.date,
})

export const dumpError = () => ({})
