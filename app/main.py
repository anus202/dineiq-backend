from fastapi import FastAPI

app = FastAPI(title="DineIQ Backend")

@app.get("/")
def read_root():
    return {"message": "DineIQ API is running"}

