const map = {
  HUMAN: 1,
  MAIL_SERVER: 2,
  AUTORESPONDER: 3,
  UNSUBSCRIBE: 4
};

map.names = Object.keys(map).reduce((names, name) => {
  return Object.assign({
    [map[name]]: name
  }, names);
}, {});

module.exports = map;
