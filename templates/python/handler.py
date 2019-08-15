# Typically this is where you import the entry point for your function
from new_function import do_stuff

def new_function_handler(event=None, context=None):
    print("HANDLING")
    do_stuff()
