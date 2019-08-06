# Remember to install the serverless cli first
# example use:
# make python name=new_function_name

python:
ifdef name
	serverless create --template-path templates/python3 --path services/$(name)
else
	serverless create --template-path templates/python3 --path services/new_function
endif
