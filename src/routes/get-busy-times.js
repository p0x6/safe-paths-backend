import geoTz from 'geo-tz'
import moment from 'moment-timezone'
import axios from 'axios'
import { logger } from '../libs/index.js'
import { dump } from '../utils/index.js'
import { Location } from '../models/index.js'

const { INTERSECTION_DELTA_MINUTES } = process.env

const timeRanges = ['9am - 12pm', '12pm - 3pm', '3pm - 6pm', '6pm - 9pm']
const dayOfWeeks = {
  1: 7,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
}

const countCertainDays = (day, startDate, endDate) => {
  const ndays = 1 + Math.round((endDate-startDate)/(24*3600*1000))

  return Math.floor((ndays + (startDate.getDay()+6-day) % 7) / 7)
}

const fillMissingTimeRanges = busyHours => {
  const startDate = moment().subtract(6, 'month').toDate()
  const endDate = moment().toDate()

  return busyHours
    .map(busyHour => {
      busyHour.timeRange = busyHour.timeRange || []

      busyHour.timeRange.sort(
        (a, b) => timeRanges.findIndex(r => r === a.timeRange) > timeRanges.findIndex(r => r === b.timeRange) ? 1 : -1,
      )

      timeRanges.forEach((range, index) => {
        if (!busyHour.timeRange[index] || busyHour.timeRange[index].timeRange !== range) {
          busyHour.timeRange.splice(index, 0, { timeRange: range, count: 0 })
        } else {
          busyHour.timeRange[index].count = busyHour.timeRange[index].count / countCertainDays(dayOfWeeks[busyHour.dayOfWeek], startDate, endDate)
        }
      })

      return busyHour
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
}

export default async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  try {
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
            { $cond: [{ $lt: [{ $hour: { date: '$createdAt', timezone } },9] }, 'Unknown', ''] },
            { $cond: [{ $and: [{ $gte: [{ $hour: { date: '$createdAt', timezone } }, 9] }, { $lt: [{ $hour: { date: '$createdAt', timezone } }, 12] }] }, '9am - 12pm', ''] },
            { $cond: [{ $and: [{ $gte: [{ $hour: { date: '$createdAt', timezone } }, 12] }, { $lt: [{ $hour: { date: '$createdAt', timezone } }, 15] }] }, '12pm - 3pm', ''] },
            { $cond: [{ $and: [{ $gte: [{ $hour: { date: '$createdAt', timezone } }, 15] }, { $lt: [{ $hour: { date: '$createdAt', timezone } }, 18] }] }, '3pm - 6pm', ''] },
            { $cond: [{ $and: [{ $gte: [{ $hour: { date: '$createdAt', timezone } }, 18] }, { $lt: [{ $hour: { date: '$createdAt', timezone } }, 21] }] }, '6pm - 9pm', ''] },
            { $cond: [{ $gte: [{ $hour: { date: '$createdAt', timezone } },21] }, 'Unknown', ''] },
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
      $match: {
        '_id.timeRange': { $ne: 'Unknown' },
      },
    }, {
      $group: {
        _id: '$_id.dayOfWeek',
        timeRange: { $push: { timeRange: '$_id.timeRange', count: '$count' } },
      },
    }, {
      $project: {
        _id: false,
        dayOfWeek: '$_id',
        timeRange: '$timeRange',
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

    return res.json({
      devicesAtPlaceNow,
      busyHours: fillMissingTimeRanges(busyHours),
    })
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
