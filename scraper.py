import sys
import json
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import sqlite3
import threading

DATABASE = 'database_books.db'

def create_driver():
    ##driver_path = r'D:\visaul studio\chromedriver-win64\chromedriver-win64\chromedriver.exe'
    driver_path = r'C:\Users\Ben91\Downloads\chromedriver-win64\chromedriver-win64\chromedriver.exe'
    service = Service(driver_path)
    
    options = webdriver.ChromeOptions()


    driver = webdriver.Chrome(service=service, options=options)
    return driver

def scrape_basic_info(username, password):
    driver = create_driver()
    student_info = {}
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    try:
        driver.get("https://sso.tku.edu.tw/NEAI/logineb.jsp?myurl=https://sso.tku.edu.tw/aissinfo/emis/tmw0012.aspx")
        
        username_input = driver.find_element(By.ID, "username")
        password_input = driver.find_element(By.ID, "password")
        
        username_input.send_keys(username)
        password_input.send_keys(password)
        password_input.submit()

        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.LINK_TEXT, "查詢學生基本資料"))).click()
        
        study_level = driver.find_element(By.XPATH, "//td[text()='目前就讀系級']/following-sibling::td[1]").text
        student_name = driver.find_element(By.XPATH, "//td[text()='中文姓名']/following-sibling::td[1]").text.strip()
        student_id = driver.find_element(By.XPATH, "//td[@id='stu_no']").text.strip()
                
        # 分割study_level成系所和年級
        def parse_department_grade(study_level):
            department = study_level[:-2] + "系"
            grade = study_level[-2] + "年級"
            return department, grade

        department, grade = parse_department_grade(study_level)

        # 判斷學院名稱
        def determine_college(department):
            college_map = {
                "商管學院": ["國企系", "風保系", "經濟系", "企管系", "會計系", "統計系", "公行系", "管科系", "資管系", "運管系", "財金系", "產經系"],
                "理學院": ["數學系", "物理系", "化學系", "尖端材料系"],
                "工學院": ["建築系", "土木系", "水環系", "機械系", "化材系", "電機系", "資工系", "航太系"],
                "文學院": ["中文系", "歷史系", "資圖系", "大傳系", "資傳系"],
                "外語學系": ["英文系", "西語系", "法語系", "德語系", "日語系", "俄語系"],
                "教育學院": ["教科系", "教育語未來設計系"],
                "AI創智學院": ["人工智慧學系"],
                "國際事務學院": ["外交與國際關係系", "國際觀光管理學系", "全球政治經濟學系"]
            }

            for college, departments in college_map.items():
                if department in departments:
                    return college
            return "未知學院"  # 如果找不到對應的學院

        department, grade = parse_department_grade(study_level)
        college = determine_college(department)

        # 將資料儲存到字典中
        student_info = {
            'user_id': student_id,
            'user_name': student_name,
            'study_level': study_level,
            'user_dept': department,
            'user_grade': grade,
            'user_coll': college
        }

        # 插入資料到資料庫
        cursor.execute('INSERT OR REPLACE INTO users (user_id, user_password, user_name, user_coll, user_dept, user_grade) VALUES (?, ?, ?, ?, ?, ?)',
                    (student_info['user_id'], password, student_info['user_name'], student_info['user_coll'], student_info['user_dept'], student_info['user_grade']))
        conn.commit()

        return True

    except Exception as e:
        print(f"Scraping error: {e}", file=sys.stderr)
        return False

    finally:
        driver.quit()
        conn.close()

def scrape_courses_info(username, password):
    driver = create_driver()
    course_info = []
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    try:
        driver.get("https://sso.tku.edu.tw/NEAI/logineb.jsp?myurl=https://sso.tku.edu.tw/aissinfo/emis/tmw0012.aspx")
        
        #輸入帳密
        username_input = driver.find_element(By.ID, "username")
        password_input = driver.find_element(By.ID, "password")
        
        username_input.send_keys(username)
        password_input.send_keys(password)
        password_input.submit()
        
        #查詢選課資料
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.LINK_TEXT, "查詢選課資料(依科目代號排列)"))).click()
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "Button1"))).click()
        
        rows = WebDriverWait(driver, 15).until(EC.presence_of_all_elements_located((By.XPATH, "//table[@id='DataGrid1']//tr[position() > 1]")))
        
        for row in rows:
            course_name = row.find_element(By.XPATH, ".//td[4]").text.strip()
            course_name = course_name.replace('\n', '').replace('\r', '')
            if len(course_name) > 5:
                course_name = course_name[:-5]
            if course_name:
                course_info.append(course_name)

        # 儲存課程信息到資料庫
        for course in course_info:
            cursor.execute('INSERT INTO courses (user_id, course_name) VALUES (?, ?)', (username, course))
        conn.commit()

        return True

    except Exception as e:
        print(f"Scraping error: {e}", file=sys.stderr)
        return False

    finally:
        driver.quit()
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({"success": False, "error": "Invalid arguments"}))
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]

    basic_info_thread = threading.Thread(target=scrape_basic_info, args=(username, password))
    courses_info_thread = threading.Thread(target=scrape_courses_info, args=(username, password))

    basic_info_thread.start()
    courses_info_thread.start()

    basic_info_thread.join()
    courses_info_thread.join()

    success = basic_info_thread.is_alive() or courses_info_thread.is_alive()
    print(json.dumps({"success": not success}))