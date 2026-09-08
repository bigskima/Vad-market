# Backend verification

Database invariant checks live under `supabase/tests/database`. Financial tests
must run transactionally and prove both the accepted path and the rejected path
(for example, balanced journals post and unbalanced journals cannot post).
