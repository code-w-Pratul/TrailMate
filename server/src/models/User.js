import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Account holder.
 *
 * Security posture:
 *  - the hash lives in `passwordHash`, and `select: false` keeps it out of
 *    every query result unless a caller explicitly asks for it
 *  - `toJSON` deletes it again as a belt-and-braces measure, so an accidental
 *    `res.json(user)` can never leak it
 *  - hashing happens in a `pre('save')` hook, so no call site can forget
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    /** Used to convert destination prices into money the user actually thinks in. */
    homeCurrency: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, 'Home currency must be a 3-letter ISO code'],
      default: 'USD',
    },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      temperatureUnit: { type: String, enum: ['C', 'F'], default: 'C' },
      distanceUnit: { type: String, enum: ['km', 'mi'], default: 'km' },
    },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

/** Hash on create and on any password change. */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash')) return next();
  // Guard against double-hashing if a caller assigns an already-hashed value.
  if (/^\$2[aby]\$\d{2}\$/.test(this.passwordHash)) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, SALT_ROUNDS);
  return next();
});

/**
 * @param {string} candidate plaintext password
 * @returns {Promise<boolean>}
 */
userSchema.methods.verifyPassword = function verifyPassword(candidate) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.passwordHash);
};

/** Convenience factory that keeps plaintext out of controller code. */
userSchema.statics.register = function register({ name, email, password, homeCurrency }) {
  return this.create({
    name,
    email,
    passwordHash: password, // hashed by the pre-save hook
    ...(homeCurrency ? { homeCurrency } : {}),
  });
};

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
export default User;
