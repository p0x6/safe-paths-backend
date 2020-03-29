export const dumpUserLocation = userLocation => ({
  location: {

    longitude: userLocation.location.coordinates[0],
    latitude: userLocation.location.coordinates[1],
  },
  uuid: userLocation.uuid,
  time: userLocation.time,
})

export const dumpError = () => ({})
