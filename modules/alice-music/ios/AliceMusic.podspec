Pod::Spec.new do |s|
  s.name           = 'AliceMusic'
  s.version        = '1.0.0'
  s.summary        = 'Apple Music (system player) control for Alice'
  s.description    = 'Play songs, artists, albums and playlists from the user library; pause, skip, shuffle, now playing.'
  s.author         = 'Alice'
  s.homepage       = 'https://github.com/robertrichards45/sentinel-ai'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'MediaPlayer'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = "**/*.{h,m,swift}"
end
