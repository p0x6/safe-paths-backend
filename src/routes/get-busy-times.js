import geoTz from 'geo-tz'
import moment from 'moment-timezone'
import axios from 'axios'
import { Location } from '../models/index.js'

const { INTERSECTION_DELTA_MINUTES } = process.env

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

  const timezone = geoTz(placePolygon.coordinates[0][0][1], placePolygon.coordinates[0][0][0])[0]

  const busyHours = await Location.aggregate([{
    $match: {
      $and: [{
        createdAt: {
          $gt: moment().tz(timezone).subtract(6, 'month').toDate(),
        },
      }, {
        location: {
          $geoWithin: {
            $geometry: placePolygon,
          },
        },
      }],
    },
  }, {
    $project: {
      device: true,
      dayOfWeek: {
        $dayOfWeek: {
          date: '$createdAt',
          timezone,
        },
      },
      timeRange: {
        $concat: [
          { $cond: [{ $lt: [{ $hour: '$createdAt' },9] }, 'Unknown', ''] },
          { $cond: [{ $and: [{ $gte: [{ $hour: '$createdAt' }, 9] }, { $lt: [{ $hour: '$createdAt' }, 12] }] }, '9am-12pm', ''] },
          { $cond: [{ $and: [{ $gte: [{ $hour: '$createdAt' }, 12] }, { $lt: [{ $hour: '$createdAt' }, 15] }] }, '12pm-3pm', ''] },
          { $cond: [{ $and: [{ $gte: [{ $hour: '$createdAt' }, 15] }, { $lt: [{ $hour: '$createdAt' }, 18] }] }, '3pm-6pm', ''] },
          { $cond: [{ $and: [{ $gte: [{ $hour: '$createdAt' }, 18] }, { $lt: [{ $hour: '$createdAt' }, 21] }] }, '6pm - 9pm', ''] },
          { $cond: [{ $gte: [{ $hour: '$createdAt' },21] }, 'Unknown', ''] },
        ],
      },
    },
  }, {
    $group: {
      _id: {
        dayOfWeek: '$dayOfWeek',
        timeRange: '$timeRange',
      },
      count: { $sum: 1 },
    },
  }, {
    $project: {
      _id: false,
      dayOfWeek: '$_id.dayOfWeek',
      timeRange: '$_id.timeRange',
      count: true,
    },
  }, {
    $match: {
      timeRange: { $ne: 'Unknown' },
    },
  }])

  const [{ count: devicesAtPlaceNow }] = await Location.aggregate([{
    $match: {
      $and: [{
        createdAt: {
          $gt: moment().tz(timezone).subtract(INTERSECTION_DELTA_MINUTES, 'minutes').toDate(),
        },
      }, {
        location: {
          $geoWithin: {
            $geometry: placePolygon,
          },
        },
      }],
    },
  }, {
    $group: {
      _id: '$device',
    },
  }, {
    $group: {
      _id: null,
      count: { $sum: 1 },
    },
  }, {
    $project: {
      _id: false,
      count: true,
    },
  }])

  console.dir({ devicesAtPlaceNow }, { depth: 20, colors: true })
  console.dir({ busyHours }, { depth: 20, colors: true })


  return res.json({})
}
