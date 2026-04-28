-- Cross-training message kinds. Adds two new values to the `message_kind`
-- enum:
--
--   cross_training_ack           , the standard acknowledgement Casey writes
--                                   for a synced cross-training activity
--                                   (ride, swim, gym, yoga, pilates, etc.).
--
--   cross_training_substitution  , the variant when a cross-training
--                                   activity appears on a day a run was
--                                   planned. Dormant until plan extraction
--                                   lands and we have structured
--                                   `planned_sessions` to detect against.
--
-- This migration adds values only. The partial unique index that enforces
-- one message per activity per kind-family lives in the next migration 
-- Postgres cannot use newly-added enum values in index predicates in the
-- same transaction they were added in.

ALTER TYPE public.message_kind ADD VALUE IF NOT EXISTS 'cross_training_ack';
ALTER TYPE public.message_kind ADD VALUE IF NOT EXISTS 'cross_training_substitution';
