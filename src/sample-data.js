export const products = [
  {id:'AV-101',name:'Wireless Headphones',category:'Electronics',price:2499,stock:42,priority:9},
  {id:'AV-102',name:'Smart Fitness Band',category:'Electronics',price:1799,stock:28,priority:8},
  {id:'AV-103',name:'Everyday Backpack',category:'Lifestyle',price:1299,stock:65,priority:6},
  {id:'AV-104',name:'Insulated Bottle',category:'Lifestyle',price:699,stock:84,priority:5},
  {id:'AV-105',name:'Mechanical Keyboard',category:'Electronics',price:3499,stock:12,priority:10},
  {id:'AV-106',name:'Cotton Crew Tee',category:'Apparel',price:599,stock:120,priority:4},
  {id:'AV-107',name:'Running Shoes',category:'Apparel',price:2199,stock:31,priority:8},
  {id:'AV-108',name:'Desk Organizer',category:'Home',price:449,stock:56,priority:3},
  {id:'AV-109',name:'LED Task Lamp',category:'Home',price:999,stock:9,priority:7},
  {id:'AV-110',name:'USB-C Power Bank',category:'Electronics',price:1799,stock:23,priority:9},
  {id:'AV-111',name:'Travel Pouch',category:'Lifestyle',price:349,stock:72,priority:4},
  {id:'AV-112',name:'Ceramic Coffee Mug',category:'Home',price:399,stock:48,priority:5}
];
// Synthetic capital opportunities. One unit = ₹1,000. Benefits are modeled planning scores, not promised returns.
export const opportunities = [
  {id:'CAP-A',name:'Catalog automation',cost:10,value:60},
  {id:'CAP-B',name:'Delivery consolidation',cost:20,value:100},
  {id:'CAP-C',name:'Checkout resilience',cost:30,value:120},
  {id:'CAP-D',name:'Demand forecasting',cost:25,value:90},
  {id:'CAP-E',name:'Warehouse scanning',cost:15,value:55}
];
export const nodes = ['Hub','North','East','Central','West','South','Port'];
export const edges = [['Hub','North',7],['Hub','West',9],['Hub','Central',14],['North','East',10],['North','West',15],['West','Central',2],['West','South',11],['Central','South',9],['East','Port',6],['South','Port',4],['Central','East',8]];
export const positions = {Hub:[80,155],North:[235,55],East:[440,60],Central:[310,215],West:[135,315],South:[435,325],Port:[590,180]};
