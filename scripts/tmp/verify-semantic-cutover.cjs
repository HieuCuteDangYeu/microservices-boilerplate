const { publishRmqMessage } = require('../send-rmq-message.cjs');

publishRmqMessage({
  queue: 'reel_index_query',
  pattern: 'index.legacy_semantic_backfill_status',
  payload: {},
})
  .then((status) => {
    console.log(
      JSON.stringify(
        {
          status,
          note: 'This reports imported Indexing documents only. Run shadow comparisons and live privacy checks before claiming cutover gates.',
        },
        null,
        2,
      ),
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
