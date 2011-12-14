require 'sinatra'

@@ROOT = File.expand_path(File.dirname(__FILE__))
views_dir = File.join(@@ROOT, 'views')
controllers_dir = File.join(@@ROOT, 'controllers')
configure do
  set :views, views_dir
end

Dir["#{controllers_dir}/*.rb"].each do |file|
  p "Loading chartered controller: '#{file}'"
  load file
end