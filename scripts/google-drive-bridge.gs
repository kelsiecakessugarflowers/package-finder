/**
 * Google Drive bridge for the Price Estimator inquiry form.
 *
 * Runs as you, so it can create folders in the Shared Drive's "💐 Current Leads" folder.
 * The Cloudflare Worker posts each inquiry here; this creates the lead's folder,
 * saves the inspiration photos and an inquiry summary doc inside it, sets
 * "anyone with the link can view", and returns the folder ID and link
 * (which the Worker writes to Airtable's "Google Drive" field).
 *
 * Setup (one time):
 *  1. script.google.com > New project. Paste this whole file in. Name it "Price Estimator Drive Bridge".
 *  2. Project Settings (gear) > Script Properties > Add: KEY = a long random password you make up.
 *  3. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy, and allow access.
 *  4. Copy the Web app URL. In Cloudflare, add Worker secrets:
 *       DRIVE_SCRIPT_URL = that URL
 *       DRIVE_SCRIPT_KEY = the same KEY as step 2
 *  After editing this script later: Deploy > Manage deployments > Edit > New version (the URL stays the same).
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('KEY');
    if (!key || body.key !== key) return out_({ok: false, error: 'unauthorized'});

    var parent = DriveApp.getFolderById(body.parentId);
    var folder = parent.createFolder(body.folderName);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    (body.photos || []).forEach(function (p) {
      folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.data), p.type, p.name));
    });

    // Inquiry summary as a Google Doc (replaces Fillout's submission PDF)
    var doc = DocumentApp.create(body.docTitle);
    var docBody = doc.getBody();
    docBody.appendParagraph(body.docTitle).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    (body.summary || []).forEach(function (row) {
      var para = docBody.appendParagraph(row[0] + ': ' + row[1]);
      para.editAsText().setBold(0, row[0].length, true);
    });
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(folder);

    return out_({ok: true, folderId: folder.getId(), folderUrl: folder.getUrl()});
  } catch (err) {
    return out_({ok: false, error: String(err)});
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
