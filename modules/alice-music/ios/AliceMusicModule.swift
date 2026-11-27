import ExpoModulesCore
import MediaPlayer

/// Controls the iPhone's Music app player (Apple Music / your library) — no developer key needed.
public class AliceMusicModule: Module {
  private var player: MPMusicPlayerController { MPMusicPlayerController.systemMusicPlayer }

  public func definition() -> ModuleDefinition {
    Name("AliceMusic")

    AsyncFunction("authorize") { (promise: Promise) in
      if MPMediaLibrary.authorizationStatus() == .authorized { promise.resolve(true); return }
      MPMediaLibrary.requestAuthorization { status in promise.resolve(status == .authorized) }
    }

    // kind: "song" | "artist" | "album" | "playlist" | "any"
    AsyncFunction("play") { (kind: String, term: String, shuffle: Bool) -> [String: Any] in
      guard MPMediaLibrary.authorizationStatus() == .authorized else { return ["found": false, "reason": "permission"] }
      let order: [String] = kind == "any" ? ["playlist", "artist", "album", "song"] : [kind]
      for k in order {
        let items = self.find(kind: k, term: term)
        if !items.isEmpty {
          self.player.setQueue(with: MPMediaItemCollection(items: items))
          self.player.shuffleMode = shuffle ? .songs : .off
          self.player.play()
          let first = items.first
          return ["found": true, "kind": k, "count": items.count, "title": first?.title ?? "", "artist": first?.artist ?? ""]
        }
      }
      return ["found": false, "reason": "not-in-library"]
    }.runOnQueue(.main)

    AsyncFunction("control") { (command: String) -> Bool in
      switch command {
      case "pause": self.player.pause()
      case "resume": self.player.play()
      case "next": self.player.skipToNextItem()
      case "previous": self.player.skipToPreviousItem()
      case "restart": self.player.skipToBeginning()
      case "shuffle_on": self.player.shuffleMode = .songs
      case "shuffle_off": self.player.shuffleMode = .off
      case "repeat_on": self.player.repeatMode = .all
      case "repeat_off": self.player.repeatMode = .none
      case "stop": self.player.stop()
      default: return false
      }
      return true
    }.runOnQueue(.main)

    AsyncFunction("nowPlaying") { () -> [String: Any] in
      let item = self.player.nowPlayingItem
      let state: String
      switch self.player.playbackState {
      case .playing: state = "playing"
      case .paused: state = "paused"
      case .stopped: state = "stopped"
      default: state = "other"
      }
      return ["state": state, "title": item?.title ?? "", "artist": item?.artist ?? "", "album": item?.albumTitle ?? ""]
    }.runOnQueue(.main)
  }

  private func find(kind: String, term: String) -> [MPMediaItem] {
    let q: MPMediaQuery
    let prop: String
    switch kind {
    case "playlist": q = MPMediaQuery.playlists(); prop = MPMediaPlaylistPropertyName
    case "artist": q = MPMediaQuery.songs(); prop = MPMediaItemPropertyArtist
    case "album": q = MPMediaQuery.songs(); prop = MPMediaItemPropertyAlbumTitle
    default: q = MPMediaQuery.songs(); prop = MPMediaItemPropertyTitle
    }
    q.addFilterPredicate(MPMediaPropertyPredicate(value: term, forProperty: prop, comparisonType: .contains))
    if kind == "playlist" {
      return (q.collections ?? []).first?.items ?? []
    }
    return q.items ?? []
  }
}
