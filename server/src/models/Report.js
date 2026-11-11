import mongoose from 'mongoose';

const changeSchema = new mongoose.Schema(
  {
    rule: { type: String, required: true },
    scope: { type: String, required: true },
    severity: { type: String, enum: ['breaking', 'additive', 'cosmetic'], required: true },
    location: { type: String, required: true },
    message: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const reportSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    summary: {
      total: { type: Number, required: true, default: 0 },
      breaking: { type: Number, required: true, default: 0 },
      additive: { type: Number, required: true, default: 0 },
      cosmetic: { type: Number, required: true, default: 0 },
    },
    verdict: {
      level: { type: String, enum: ['major', 'minor', 'patch', 'none'], required: true },
      reason: { type: String, required: true },
      current: { type: String, default: null },
      next: { type: String, default: null },
    },
    meta: {
      beforeVersion: { type: String, default: null },
      afterVersion: { type: String, default: null },
      beforeTitle: { type: String, default: null },
      afterTitle: { type: String, default: null },
      pathsCompared: { type: Number, default: 0 },
      openapi: { type: String, default: null },
    },
    changes: { type: [changeSchema], default: [] },
    changelog: { type: String, required: true },
    views: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret._id;
        return ret;
      },
    },
  },
);

reportSchema.index({ createdAt: -1 });

export const Report = mongoose.model('Report', reportSchema);
export default Report;
