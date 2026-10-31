cmake_minimum_required(VERSION 3.25)

project(MapBackend LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Drogon CONFIG REQUIRED)

add_executable(map_server
    src/main.cpp
)

target_link_libraries(map_server
    PRIVATE Drogon::Drogon
)