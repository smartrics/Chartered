require File.join(File.expand_path(File.dirname(__FILE__)), 'app/chartered.rb')

set :run, false
set :environment, :production

run Sinatra::Application
