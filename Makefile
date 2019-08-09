# Remember to install the serverless cli first
# example use:
# make python name=new_function_name

python:
ifdef name
	serverless create --template-path templates/python3 --path services/$(name)
	npm i --prefix ./services/$(name) --save-dev
else
	serverless create --template-path templates/python3 --path services/new_function
	npm i --prefix ./services/new_function --save-dev
endif
