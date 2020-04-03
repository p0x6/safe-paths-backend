import mongoose from 'mongoose'

const { Schema } = mongoose
// const { ObjectId } = Types

const deviceSchema = new Schema({
  uuid: {
    type: String,
    required: true,
  },
},{
  timestamps: true,
})

class Device {}

deviceSchema.loadClass(Device)

deviceSchema.index({ uuid: 1 }, { unique: true })

delete mongoose.connection.models.Device

export default mongoose.model('Device', deviceSchema)
