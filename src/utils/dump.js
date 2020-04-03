export const dumpUserLocation = userLocation => ({
  location: {
    type: userLocation.location.type,
    coordinates: userLocation.location.coordinates,
  },
  time: userLocation.time,
})

export const dumpPlace = place => ({
  placeId: place.placeId,
  name: place.name,
  address: place.address,
  location: {
    type: place.location.type,
    coordinates: [place.location.coordinates[0], place.location.coordinates[1]],
  },
  busyPercentage: place.busyPercentage,
})

export const dumpIntersection = intersection => ({
  count: intersection.count,
  date: intersection.date,
})

export const dumpError = () => ({})
