const fs = require('fs');

const moment = require('moment-timezone');

const colors = require('colors');

const WebSocket = require('ws');
const wssServer = new WebSocket.Server({ 'port': 3001 });

const bittrex = require('node-bittrex-api');
bittrex.options({
    'apikey': '',
    'apisecret': ''
});

const getBittrexMarketDataPromise = () => {
    return new Promise((resolve, reject) => {
        let tickerPromises = [];
        bittrex.getmarkets((markets, err) => {
            if (err) {
                reject(err);
            } else {
                if (markets.success === true) {
                    markets.result.forEach((market, marketIndex) => {
                        if (market.IsActive && market.BaseCurrency === 'BTC') {
                            tickerPromises.push(tickerPromise(market.MarketName));
                        } else {}
                    });
                    Promise.all(tickerPromises).then(tickersPromised => {
                        resolve(tickersPromised);
                    }).catch(err => {
                        reject(err);
                    });
                }
            }
        });
    });
};
const tickerPromise = marketName => {
    return new Promise((resolve, reject) => {
        bittrex.getticker({ market: marketName }, (ticker, err) => {
            if (err) {
                reject(err);
            } else {
                if (ticker.success === true) {
                    resolve({
                        name: marketName,
                        x: moment().tz("America/New_York").format("YYYY-MM-DD HH:mm:ss"),
                        y: ticker.result.Last
                    });
                }
            }
        });
    });
};

wssServer.on('connection', (ws, req) => {
    ws.on('message', messageFromClient => {
        console.log(messageFromClient);
        Promise.resolve(JSON.parse(messageFromClient)).then(jsonMessage => {
            switch (jsonMessage.type) {
                case 'open':
                    {
                        getBittrexMarketDataPromise().then(markets => {
                            let previousMarketValues = [];
                            markets.forEach((market, marketIndex) => {
                                markets[marketIndex].y2 = markets[marketIndex].y;
                                markets[marketIndex].y = [0];
                                markets[marketIndex].x = [markets[marketIndex].x];
                                markets[marketIndex].type = ['scatter'];
                                previousMarketValues.push(market);
                            });
                            ws.send(JSON.stringify({
                                type: 'init',
                                initMarkets: previousMarketValues
                            }));
                            return Promise.resolve(previousMarketValues);
                        }).then(initMarketValues => {
                            let startScan = new Date();
                            let previousMarketValues = initMarketValues;
                            setInterval(() => {
                                let updatedMarkets = {
                                    y: [],
                                    x: []
                                };
                                let indexes = [];
                                getBittrexMarketDataPromise().then(markets => {
                                    markets.forEach((market, marketIndex) => {
                                        previousMarketValues.forEach((previousMarket, previousMarketIndex) => {
                                            if (market.name === previousMarket.name) {
                                                let console_timestamp = moment().tz("America/New_York").format("YYYY-MM-DD HH:mm:ss");
                                                if (((market.y - previousMarket.y2) / previousMarket.y2) * 100 === 0) {} else {
                                                    previousMarket.y[0] = +previousMarket.y[0] + +(((market.y - previousMarket.y2) / previousMarket.y2) * 100);
                                                    previousMarket.x[0] = market.x;
                                                    updatedMarkets.y.push([previousMarketValues[previousMarketIndex].y[0]]);
                                                    updatedMarkets.x.push([previousMarketValues[previousMarketIndex].x[0]]);
                                                    indexes.push(previousMarketIndex);
                                                    if (((market.y - previousMarket.y2) / previousMarket.y2) * 100 > 0) {
                                                        console.log(`${market.name} => ${previousMarket.y[0].toFixed(2)}%                  @ '${console_timestamp}' since '${moment(startScan).tz("America/New_York").format("YYYY-MM-DD HH:mm:ss")}'`.green);
                                                    } else {
                                                        console.log(`${market.name} => ${previousMarket.y[0].toFixed(2)}%                  @ '${console_timestamp}' since '${moment(startScan).tz("America/New_York").format("YYYY-MM-DD HH:mm:ss")}'`.red);
                                                    }
                                                }
                                            };
                                        });
                                    });
                                    ws.send(JSON.stringify({
                                        type: 'update',
                                        updatedMarkets: updatedMarkets,
                                        indexes: indexes
                                    }));
                                }).catch(err => {
                                    console.log(err);
                                });
                            }, 10000);
                        }).catch(err => {
                            console.log(err);
                        });
                        break;
                    }
                default:
                    {

                    }
            }
        }).catch(err => {
            console.log(err);
        });
    });
});