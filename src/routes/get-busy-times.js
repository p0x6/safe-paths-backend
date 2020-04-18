import axios from 'axios'
import { Location } from '../models/index.js'

export default async (req, res) => {
  const { placeId } = req.params

  const { data } = await axios({
    method: 'GET',
    url: `http://overpass-api.de/api/interpreter?data=[out:json];way(${placeId});out geom;`,
  })
  const placePolygon = data.elements[0].geometry
    .reduce((polygon, coordinates) => {
      polygon.coordinates[0].push([coordinates.lon, coordinates.lat])
      return polygon
    }, {
      type: 'Polygon',
      coordinates: [[]],
    })

  console.dir({ placePolygon }, { depth: 20, colors: true })

  const result = await Location.aggregate([{
    $match: {
      location: {
        $geoWithin: {
          $geometry: placePolygon,
        },
      },
    },
  }])

  console.dir({ result }, { depth: 20, colors: true })

  return res.json({})
}
