// All songs here are parsed JSON objects returned from the spotify API

// takes a song and returns the song's name
function getSongName(song) {
  return song.name;
}

// takes a song and returns the song's artist's name
function getSongArtist(song) {
  return song.artists[0].name;
}

// returns the spotify link
function getSongLink(song) {
  return song.href;
}

// sets a song's link.  used when consolidating search results
// (not sure if necessary)
function setSongLink(song, href) {
    song.href = href;
}

// takes a track and a region as a string eg 'US' and returns a true/false value
// based on if it's available
function isSongAvailable(song,region) {
  var availability = song.album.availability.territories;
  return (availability.indexOf(region) > -1) ? true : false;
}

// add a given region string to a song's availability 
// used to consolidate when multiple of the same song is returned by spotify
// search
function addSongAvailable(song,region) {
 song.album.availability.territories += region;
}
