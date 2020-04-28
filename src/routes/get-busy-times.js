import Joi from '@hapi/joi'
import axios from 'axios'
import isPointInPolygon from '@turf/boolean-point-in-polygon'
import { logger } from '../libs/index.js'
import {
  dump,
  validator,
  getBusyHoursBasedOnOwnData,
  getBusyHoursBasedOnGoogleMaps,
  getGooglePlaceDetails,
} from '../utils/index.js'

const makePolygonFromGeometry = geometry => geometry
  .reduce((polygon, coordinates) => {
    polygon.coordinates[0].push([coordinates.lon, coordinates.lat])
    return polygon
  }, {
    type: 'Polygon',
    coordinates: [[]],
  })

export default async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json')
    let busyHours = {}
    const data = validator.validate(
      req.query,
      Joi.object().keys({
        placeId: Joi.string().required(),
        type: Joi.string().default('google').valid('google', 'own'),
      }),
    )

    if (data.type === 'own') {
      busyHours = await getBusyHoursBasedOnOwnData(data.placeId)
    } else {
      const place = await getGooglePlaceDetails(data.placeId)
      const wayQuery = `
      [out:json];
      way(around:25,${place.coordinates.latitude},${place.coordinates.longitude})
      ;out geom;
      `
      const { data: openRoutePlaces = { elements: [] } } = await axios({
        method: 'GET',
        url: `http://overpass-api.de/api/interpreter?data=${wayQuery}`,
      })
      const way = openRoutePlaces.elements.find(
        element => isPointInPolygon.default(
          {
            type: 'Point',
            coordinates: [
              place.coordinates.longitude,
              place.coordinates.latitude,
            ],
          },
          makePolygonFromGeometry(element.geometry),
        ),
      )

      if (way) {
        busyHours = await getBusyHoursBasedOnOwnData(way.id)
          .catch(async () => await getBusyHoursBasedOnGoogleMaps(place))

        const emptyRanges = busyHours.busyHours.reduce(
          (acc, busyHour) => {
            const empty = busyHour.timeRange.filter(r => r.load === 0).length
            return acc + empty
          },
          0,
        )
        if (emptyRanges > 2) {
          busyHours = await getBusyHoursBasedOnGoogleMaps(place)
        }
      } else {
        busyHours = await getBusyHoursBasedOnGoogleMaps(place)
      }

      busyHours = {
        ...busyHours,
        name: place.name,
        address: place.address,
        coordinates: place.coordinates,
      }
    }

    return res.json(busyHours)
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
