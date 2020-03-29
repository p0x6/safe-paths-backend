import mongoose from 'mongoose'
import pointSchema from './point.js'

const { Schema, Types } = mongoose
const { ObjectId } = Types

const locationSchema = new Schema({
  device: {
    type: ObjectId,
    required: true,
    ref: 'Device',
  },
  location: {
    type: pointSchema,
    required: true,
    index: '2dsphere',
  },
}, {
  timestamps: true,
})

class Location {}

locationSchema.loadClass(Location)

locationSchema.index({ location: '2dsphere' })

delete mongoose.connection.models.Location

export default mongoose.model('Location', locationSchema)
