import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connect(uri, options = {}) {
  const target = uri ?? process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/specdrift';
  await mongoose.connect(target, {
    serverSelectionTimeoutMS: 8000,
    ...options,
  });
  return mongoose.connection;
}

export async function disconnect() {
  await mongoose.connection.close();
}

export function connectionState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] ?? 'unknown';
}
