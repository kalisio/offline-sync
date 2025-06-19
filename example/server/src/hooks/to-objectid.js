import { ObjectId } from 'mongodb'

export async function toObjectId(context) {
  const { data } = context
  if (data._id) {
    context.data = {
      ...data,
      _id: new ObjectId(data._id)
    }
  }
}
