import axios from 'axios'

const { OPENROUTE_API_KEY } = process.env

export default async (startLocation, endLocation, avoidPolygons = []) => {
  const { data: { features: routes } } = await axios({
    method: 'POST',
    url: 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson',
    headers: {
      authorization: OPENROUTE_API_KEY,
    },
    data: {
      coordinates: [
        startLocation,
        endLocation,
      ],
      ... avoidPolygons && avoidPolygons.length > 0
        ? {
          options: {
            avoid_polygons: avoidPolygons.reduce(
              (acc, polygon) => {
                acc.coordinates.push(polygon.coordinates)

                return acc
              },
              {
                type: 'MultiPolygon',
                coordinates: [],
              },
            ),
          },
        }
        : {},
    },
  })

  return routes
}
