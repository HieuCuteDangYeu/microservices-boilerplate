const { publishRmqMessage } = require('../send-rmq-message.cjs');

publishRmqMessage({
  queue: 'reel_index_query',
  pattern: 'index.legacy_semantic_backfill_status',
  payload: {},
})
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
