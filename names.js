var hackers = ["mitnick", "hax0r", "skiddie", "#$%&", "swordfish", "zer0cool", "angelina"];
var possibilities = ["wodehouse", "ketchup", "mustard", "relish", "young frankenstein", "felicity", "snickers", "kennedy", "waterford", "jenkins", "scooby", "fettucini", "garth", "caboose", "fork", "knife", "spoon", "wofford", "cruise_elroy", "salazar", "bourgeois", "peanut"];

this.hackerName = function(){
  return hackers[Math.floor(Math.random() * hackers.length)];
}

this.generalName = function(){
  return possibilities[Math.floor(Math.random() * possibilities.length)];
}

this.numberIt = function(base){
  var chars = '0123456789';
  var name = base;
  for(var i = 0;i<3;i++) {
    var rnum = Math.floor(Math.random()*chars.length);
    name += chars[rnum];
  }
  return name;
}

module.exports = this;