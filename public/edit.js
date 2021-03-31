const uidRegex = /uid=([0-9]*);?/
const uid = uidRegex.exec(document.cookie)[1]
const user = getUser()

const guests = { a: 'Guest A', b: 'Guest B', c: 'Guest C', d: 'Guest D', e: 'Guest E', f: 'Guest F' }
const guestList = Object.keys(guests)

function showPassword (inputBoxID, inputButtonID) {
  const x = document.getElementById(inputBoxID)
  const y = document.getElementById(inputButtonID)
  if (x.type == 'password') {
    x.type = 'text'
    y.value = 'Hide Key'
  } else {
    x.type = 'password'
    y.value = 'Show Key'
  }
}

function fetch (uri) {
  let res = null
  const x = new XMLHttpRequest()
  x.open('GET', uri, false)
  x.send()
  if (x.status == 200) {
    res = x.responseText
  }
  return res
}

function getOverlay (overlayFile) {
  return fetch(overlayFile)
}

function getUser () {
  const j = fetch(`/users/${uid}.json`)
  if (j) {
    return JSON.parse(j)
  } else {
    return null
  }
}

const sel = document.getElementById('background')
const sel2 = document.getElementById('flag')
const sel3 = document.getElementById('overlay')
const sel4 = document.getElementById('coin')
const sel6 = document.getElementById('font')
const sel7 = document.getElementById('mii-select')

const miiUploadButton = document.getElementById('mii-upload')

sel.onchange = function () {
  document.getElementById('background-img').src = '/' + this.value
}

sel2.onchange = function () {
  document.getElementById('flag-img').src = '/flags/' + this.value + '.png'
}

sel3.onchange = function () {
  let cimg
  document.getElementById('overlay-img').src = '/img/overlays/' + this.value.replace('.json', '') + '.png'
  const overlay = JSON.parse(getOverlay(`/overlays/${this.value}`))
  if (sel4.value == 'default') {
    cimg = overlay.coin_icon.img + '.png'
    document.getElementById('coin-img').src = '/img/coin/' + cimg
  }
}

sel4.onchange = function () {
  let cimg
  const overlay = JSON.parse(getOverlay(`/overlays/${sel3.value}`))
  if (this.value == 'default') {
    cimg = overlay.coin_icon.img + '.png'
  } else {
    cimg = this.value + '.png'
  }
  document.getElementById('coin-img').src = '/img/coin/' + cimg
}

sel6.onchange = function () {
  let cimg
  const overlay = JSON.parse(getOverlay(`/overlays/${sel3.value}`))
  console.log(this.value)
  if (this.value == 'default') {
    cimg = overlay.username.font_family + '.png'
  } else {
    cimg = this.value + '.png'
  }
  document.getElementById('font-img').src = '/img/font/' + cimg
}

sel7.onchange = function () {
  miiImg = document.getElementById('mii-img')

  if (this.value == 'custom') {
    unhideMiiUpload()
    document.getElementById('mii-data').value = user.mii_data
  } else {
    hideMiiUpload()
    document.getElementById('mii-data').value = this.value
  }

  if (guestList.includes(this.value)) {
    miiImg.src = `/miis/guests/${this.value}.png`
  } else {
    miiImg.src = `http://miicontestp.wii.rc24.xyz/cgi-bin/render.cgi?data=${user.mii_data}`
  }
}

const miiUploadBox = document.getElementById('mii-box')
const miiErrorBox = document.getElementById('mii-error-box')

function unhideMiiUpload () {
  miiUploadBox.style = ''
}

function hideMiiUpload () {
  miiUploadBox.style = 'display: none;'
}

function unhideMiiError () {
  miiErrorBox.style = ''
}

function hideMiiError () {
  miiErrorBox.style = 'display: none;'
}

function showMiiError (message) {
  document.getElementById('mii-success').style = 'display: none;'
  document.getElementById('mii-error-text').textContent = message
  unhideMiiError()
}

function showMiiSuccess () {
  document.getElementById('mii-success').style = ''
  hideMiiError()
}

document.getElementById('mii-file').onchange = function () {
  const file = document.getElementById('mii-file').files[0]
  if (!file) {
    console.log('No file')
    showMiiError('No file has been selected.')
    return
  }
  const reader = new FileReader()
  reader.onload = function () {
    const buffer = reader.result
    if (buffer.byteLength != 74) {
      console.log('Not a mii')
      showMiiError('The file selected is not a valid Mii.')
      return
    }
    const dv = new DataView(buffer, 0)
    const byteArray = []
    for (let i = 0; i < 74; i++) {
      byteArray.push(dv.getUint8(i))
    }
    const hexString = Array.from(byteArray, function (byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2)
    }).join('')
    document.getElementById('mii-data').value = hexString
    miiImg.src = `http://miicontestp.wii.rc24.xyz/cgi-bin/render.cgi?data=${hexString}`
    showMiiSuccess()
    console.log('Set data to ' + hexString)
  }
  reader.readAsArrayBuffer(file)
}
