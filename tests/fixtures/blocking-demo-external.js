// No SPDX identifier, no GNU license comment tag, no web-labels hint —
// classified "missing", which isn't in the default allowed-categories
// list, so it's a blocking candidate once "Block non-allowed scripts on
// this device" is enabled.
alert(
  'NOT BLOCKED: this script ran, so blocking either isn\'t enabled or ' +
  'hasn\'t taken effect yet for this script/browser (see the fixture ' +
  'page for what to expect on Chrome vs. Firefox).'
);
