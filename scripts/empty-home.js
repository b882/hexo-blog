// Hexo's index generator omits index.html when there are no posts.
// Keep an empty Butterfly homepage so removed articles cannot leave a stale homepage.
hexo.extend.generator.register('empty-home', function (locals) {
  if (locals.posts.length > 0) return [];

  return [{
    path: 'index.html',
    layout: 'index',
    data: {
      __index: true,
      posts: locals.posts,
      base: '',
      total: 1,
      current: 1,
      prev: 0,
      next: 0,
      prev_link: '',
      next_link: ''
    }
  }];
});
