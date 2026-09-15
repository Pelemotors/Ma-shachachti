import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {
  private let suiteName = "group.il.co.mashachachti.app"

  override func isContentValid() -> Bool { true }

  override func didSelectPost() {
    var payload: [String: Any] = [
      "id": UUID().uuidString,
      "stagedAt": ISO8601DateFormatter().string(from: Date()),
      "imageCount": 0
    ]
    if let text = contentText, !text.isEmpty {
      payload["text"] = text
    }
    if let item = extensionContext?.inputItems.first as? NSExtensionItem {
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { value, _ in
            if let url = value as? URL {
              payload["url"] = url.absoluteString
            }
            self.persist(payload)
          }
          return
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
          payload["imageCount"] = (payload["imageCount"] as? Int ?? 0) + 1
        }
      }
    }
    persist(payload)
  }

  private func persist(_ payload: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: payload) {
      UserDefaults(suiteName: suiteName)?.set(data, forKey: "pending_share")
    }
    extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
  }

  override func configurationItems() -> [Any]! { [] }
}
