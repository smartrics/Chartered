get '/' do
  @samples_dir = ENV['SAMPLES_DIR']
  status 200
  erb :index
end
